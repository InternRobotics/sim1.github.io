/**
 * Dual-panel trajectory visualization: simulation streams A/B/C with segment cuts,
 * and a single generated trajectory (interacting samples + smooth moving fill).
 */
(() => {
    const canvasSource = document.getElementById('trajSourceCanvas');
    const canvasGen = document.getElementById('trajGenCanvas');
    if (!canvasSource || !canvasGen) return;

    let ctxS = canvasSource.getContext('2d');
    let ctxG = canvasGen.getContext('2d');

    function getTrajectoryPalette() {
        if (document.body.classList.contains('theme-light')) {
            return {
                A: 'rgba(123, 118, 145, 0.92)',
                B: 'rgba(108, 138, 170, 0.88)',
                C: 'rgba(150, 119, 103, 0.84)',
                gen: 'rgba(141, 118, 180, 0.94)',
                axis: 'rgba(92, 73, 51, 0.48)',
                cut: 'rgba(110, 88, 60, 0.32)',
                label: 'rgba(99, 81, 60, 0.58)',
                dotStroke: 'rgba(247, 241, 232, 0.9)',
                legendText: 'rgba(66, 50, 35, 0.92)',
                badge: '#68a063',
                hintStrong: 'rgba(84, 65, 45, 0.62)',
                hintSoft: 'rgba(110, 88, 60, 0.44)',
                backdropTop: '#f8f1e5',
                backdropMid: '#f1e6d6',
                backdropBottom: '#eadfcd',
                radialA: 'rgba(183, 164, 140, 0.22)',
                radialB: 'rgba(214, 198, 178, 0.08)',
                floorShade: 'rgba(197, 178, 154, 0.34)',
                waveLayers: [
                    'rgba(170, 151, 126, 0.18)', 'rgba(160, 141, 118, 0.22)', 'rgba(153, 134, 113, 0.18)',
                    'rgba(147, 129, 108, 0.2)', 'rgba(157, 139, 117, 0.18)', 'rgba(164, 147, 124, 0.19)',
                    'rgba(149, 132, 112, 0.18)', 'rgba(142, 126, 108, 0.18)', 'rgba(170, 153, 130, 0.16)',
                    'rgba(162, 145, 124, 0.17)', 'rgba(148, 132, 113, 0.16)', 'rgba(140, 125, 108, 0.15)',
                    'rgba(166, 148, 126, 0.14)'
                ],
                fineWaveA: 'rgba(140, 123, 103, 0.12)',
                fineWaveB: 'rgba(153, 134, 112, 0.1)',
                ghostCurve: (g) => {
                    const a = 0.045 + (g % 6) * 0.005;
                    const tint = 146 + (g % 4) * 7;
                    return `rgba(${tint}, ${tint - 18}, ${tint + 10}, ${a})`;
                },
                genShadow: 'rgba(133, 110, 170, 0.18)'
            };
        }

        return {
            A: 'rgba(200, 205, 220, 0.92)',
            B: 'rgba(170, 190, 230, 0.88)',
            C: 'rgba(150, 165, 200, 0.85)',
            gen: 'rgba(185, 175, 235, 0.96)',
            axis: 'rgba(255,255,255,0.52)',
            cut: 'rgba(255,255,255,0.42)',
            label: 'rgba(255,255,255,0.48)',
            dotStroke: 'rgba(255,255,255,0.38)',
            legendText: '#ffffff',
            badge: '#86efac',
            hintStrong: 'rgba(255, 255, 255, 0.52)',
            hintSoft: 'rgba(255, 255, 255, 0.4)',
            backdropTop: '#0c101c',
            backdropMid: '#070a12',
            backdropBottom: '#05060e',
            radialA: 'rgba(26, 36, 58, 0.28)',
            radialB: 'rgba(12, 16, 28, 0.1)',
            floorShade: 'rgba(8, 14, 28, 0.55)',
            waveLayers: [
                'rgba(48, 62, 95, 0.26)', 'rgba(52, 68, 102, 0.34)', 'rgba(44, 58, 90, 0.28)',
                'rgba(46, 60, 94, 0.3)', 'rgba(38, 52, 82, 0.26)', 'rgba(40, 54, 86, 0.27)',
                'rgba(48, 62, 96, 0.26)', 'rgba(50, 64, 98, 0.25)', 'rgba(34, 46, 74, 0.23)',
                'rgba(36, 48, 76, 0.24)', 'rgba(54, 68, 102, 0.22)', 'rgba(58, 72, 108, 0.2)',
                'rgba(42, 56, 86, 0.2)'
            ],
            fineWaveA: 'rgba(70, 88, 128, 0.14)',
            fineWaveB: 'rgba(82, 98, 138, 0.12)',
            ghostCurve: (g) => {
                const a = 0.05 + (g % 6) * 0.006;
                const tint = 135 + (g % 4) * 8;
                return `rgba(${tint}, ${tint - 15}, ${tint + 35}, ${a})`;
            },
            genShadow: 'rgba(130, 120, 210, 0.25)'
        };
    }

    let Ws = 400;
    let Hs = 320;
    let Wg = 400;
    let Hg = 320;

    function applyCanvasSize(canvas, w, h) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    function baseY(t) {
        const u = t * Math.PI * 2;
        return (
            0.42 * Math.sin(u * 1.1) +
            0.18 * Math.sin(u * 3.7 + 0.4) +
            0.1 * Math.sin(u * 8.2) +
            0.5
        );
    }

    function seriesY(t, seed) {
        const phase = seed * 0.17;
        const amp = 0.06 + seed * 0.02;
        return baseY(t + phase) + amp * Math.sin(t * Math.PI * 22 + seed);
    }

    function buildCuts(seed) {
        const cuts = [0];
        let t = 0;
        let moving = true;
        const rnd = (k) => {
            const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
            return x - Math.floor(x);
        };
        let k = 0;
        while (t < 1 - 1e-4) {
            const len = moving ? 0.08 + rnd(k++) * 0.14 : 0.03 + rnd(k++) * 0.055;
            t = Math.min(1, t + len);
            cuts.push(t);
            moving = !moving;
        }
        if (cuts[cuts.length - 1] < 1) cuts.push(1);
        return cuts;
    }

    const cutsA = buildCuts(1.1);
    const cutsB = buildCuts(2.3);
    const cutsC = buildCuts(3.7);

    function segmentIsInteracting(cuts, intervalIndex) {
        return intervalIndex % 2 === 1;
    }

    function collectInteracting(cuts, seed) {
        const out = [];
        for (let i = 0; i < cuts.length - 1; i++) {
            if (!segmentIsInteracting(cuts, i)) continue;
            const t0 = cuts[i];
            const t1 = cuts[i + 1];
            const mid = (t0 + t1) * 0.5;
            out.push({ t: mid, y: seriesY(mid, seed), t0, t1 });
        }
        return out;
    }

    const sampA = collectInteracting(cutsA, 0);
    const sampB = collectInteracting(cutsB, 1);
    const sampC = collectInteracting(cutsC, 2);

    function stitchABC() {
        const out = [];
        let ia = 0,
            ib = 0,
            ic = 0;
        while (ia < sampA.length || ib < sampB.length || ic < sampC.length) {
            if (ia < sampA.length) out.push({ ...sampA[ia++], tag: 'A' });
            if (ib < sampB.length) out.push({ ...sampB[ib++], tag: 'B' });
            if (ic < sampC.length) out.push({ ...sampC[ic++], tag: 'C' });
        }
        return out;
    }

    const stitched = stitchABC();

    function catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }

    /** Vertical range from all simulation traces + stitched knots; padding absorbs spline overshoot. */
    function computeYBounds() {
        let lo = Infinity;
        let hi = -Infinity;
        function add(y) {
            if (y < lo) lo = y;
            if (y > hi) hi = y;
        }
        for (let s = 0; s < 3; s++) {
            for (let i = 0; i <= 800; i++) {
                add(seriesY(i / 800, s));
            }
        }
        stitched.forEach((s) => add(s.y));
        const span = hi - lo || 1;
        const pad = span * 0.2;
        return { lo: lo - pad, hi: hi + pad };
    }

    const YBounds = computeYBounds();

    function denseFromPts(pts) {
        const n = pts.length;
        if (n < 2) return [];
        const dense = [];
        const segSteps = 28;
        for (let i = 0; i < n - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p0 = i === 0 ? p1 : pts[i - 1];
            const p3 = i >= n - 2 ? p2 : pts[i + 2];
            for (let s = 0; s <= segSteps; s++) {
                if (i > 0 && s === 0) continue;
                const t = s / segSteps;
                const x = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
                let y = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
                y = Math.min(YBounds.hi, Math.max(YBounds.lo, y));
                dense.push({ x, y });
            }
        }
        return dense;
    }

    function knotsFromStitched(perturb) {
        const n = stitched.length;
        return stitched.map((s, i) => {
            const dy = perturb ? perturb(i) : 0;
            return {
                x: i / (n - 1),
                y: Math.min(YBounds.hi, Math.max(YBounds.lo, s.y + dy))
            };
        });
    }

    const genCurve = denseFromPts(knotsFromStitched(null));

    /** Sibling trajectories: same stitch + gap-fill structure, perturbed knots → many valid samples. */
    const ghostGenCurves = (() => {
        const out = [];
        for (let g = 0; g < 24; g++) {
            const seed = g * 13.17 + 4.2;
            const tier = (g % 7) - 3;
            out.push(
                denseFromPts(
                    knotsFromStitched((i) => {
                        return (
                            0.045 * Math.sin(seed * 1.85 + i * 2.08) +
                            0.032 * Math.sin(seed * 0.42 + i * 0.91) +
                            0.018 * tier +
                            0.022 * Math.sin((seed + i) * 3.4)
                        );
                    })
                )
            );
        }
        return out;
    })();

    function xMap(t, pl, pr, w) {
        return pl + t * (w - pl - pr);
    }
    function yMap(y, pt, pb, h) {
        return pt + (1 - y) * (h - pt - pb);
    }

    /** Map raw joint value into plot Y using shared [lo, hi] so peaks are not clipped. */
    function yMapData(y, pt, pb, h) {
        const y01 = (y - YBounds.lo) / (YBounds.hi - YBounds.lo);
        return yMap(Math.min(1, Math.max(0, y01)), pt, pb, h);
    }

    /** Interacting-sample markers: shape encodes source stream A / B / C (matches left panel colors). */
    function drawStreamMarker(ctx, x, y, tag, palette, scale = 1) {
        const r = 3.5 * scale;
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.dotStroke;
        if (tag === 'A') {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = palette.A;
            ctx.fill();
            ctx.stroke();
        } else if (tag === 'B') {
            const s = r * 1.35;
            ctx.beginPath();
            ctx.rect(x - s * 0.5, y - s * 0.5, s, s);
            ctx.fillStyle = palette.B;
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(x, y - r * 1.15);
            ctx.lineTo(x + r, y + r * 0.75);
            ctx.lineTo(x - r, y + r * 0.75);
            ctx.closePath();
            ctx.fillStyle = palette.C;
            ctx.fill();
            ctx.stroke();
        }
    }

    /** Top-right on both panels: ○ □ △ = A B C */
    function drawShapeLegend(ctx, w, palette) {
        const legendW = 158;
        const startX = w - legendW;
        const titleY = 11;
        const rowY = 26;
        const title = '';
        ctx.font = '13px Source Sans 3, system-ui, sans-serif';
        ctx.fillStyle = palette.legendText;
        const titleW = ctx.measureText(title).width;
        ctx.fillText(title, startX + (legendW - titleW) / 2, titleY);
        ctx.font = '13px Source Sans 3, system-ui, sans-serif';
        let lx = startX;
        ['A', 'B', 'C'].forEach((t) => {
            drawStreamMarker(ctx, lx + 6, rowY, t, palette, 0.72);
            ctx.fillStyle = palette.legendText;
            ctx.fillText(t, lx + 17, rowY + 4);
            lx += 48;
        });
    }

    function drawCheckerBadge(ctx, w, h, palette) {
        const text = 'checker ✓';
        ctx.save();
        ctx.font = '600 13px Source Sans 3, system-ui, sans-serif';
        ctx.fillStyle = palette.badge;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(text, w - 14, h - 38);
        ctx.restore();
    }

    /** Right panel only: clarifies one highlighted sample vs scalable outputs. */
    function drawGenManyHint(ctx, w, h, pl, pt, pb, palette) {
        const plotBot = yMap(0, pt, pb, h);
        ctx.save();
        ctx.font = '11px Source Sans 3, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = palette.hintStrong;
        ctx.fillText('one trajectory highlighted · same pipeline', pl + 8, plotBot - 5);
        ctx.fillStyle = palette.hintSoft;
        ctx.fillText('many more (identical procedure)', pl + 8, plotBot - 5 - 15);
        ctx.restore();
    }

    /** Dark multi-layer wave strokes behind plot (both panels). */
    function drawWaveBackdrop(ctx, w, h, t, palette) {
        ctx.save();
        const g0 = ctx.createLinearGradient(0, 0, 0, h);
        g0.addColorStop(0, palette.backdropTop);
        g0.addColorStop(0.48, palette.backdropMid);
        g0.addColorStop(1, palette.backdropBottom);
        ctx.fillStyle = g0;
        ctx.fillRect(0, 0, w, h);

        const rg = ctx.createRadialGradient(w * 0.52, h * 0.38, 0, w * 0.5, h * 0.48, Math.max(w, h) * 0.85);
        rg.addColorStop(0, palette.radialA);
        rg.addColorStop(0.55, palette.radialB);
        rg.addColorStop(1, 'transparent');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);

        const g2 = ctx.createLinearGradient(0, h * 0.65, 0, h);
        g2.addColorStop(0, 'transparent');
        g2.addColorStop(1, palette.floorShade);
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, w, h);

        const layers = [
            { base: 0.06, amp: 9, f: 0.016, s: 0.72, col: palette.waveLayers[0], lw: 0.95 },
            { base: 0.12, amp: 12, f: 0.013, s: 0.85, col: palette.waveLayers[1], lw: 1.1 },
            { base: 0.19, amp: 15, f: 0.0112, s: -0.55, col: palette.waveLayers[2], lw: 1.05 },
            { base: 0.26, amp: 17, f: 0.0105, s: 0.62, col: palette.waveLayers[3], lw: 1.2 },
            { base: 0.33, amp: 13, f: 0.0195, s: 0.95, col: palette.waveLayers[4], lw: 0.98 },
            { base: 0.4, amp: 14, f: 0.018, s: 1.05, col: palette.waveLayers[5], lw: 1 },
            { base: 0.47, amp: 18, f: 0.0095, s: -0.48, col: palette.waveLayers[6], lw: 1.15 },
            { base: 0.54, amp: 20, f: 0.0088, s: -0.42, col: palette.waveLayers[7], lw: 1.3 },
            { base: 0.61, amp: 14, f: 0.0148, s: 0.68, col: palette.waveLayers[8], lw: 1 },
            { base: 0.68, amp: 15, f: 0.0155, s: 0.72, col: palette.waveLayers[9], lw: 1.05 },
            { base: 0.75, amp: 19, f: 0.0078, s: -0.33, col: palette.waveLayers[10], lw: 1.25 },
            { base: 0.82, amp: 22, f: 0.0072, s: -0.38, col: palette.waveLayers[11], lw: 1.45 },
            { base: 0.9, amp: 11, f: 0.021, s: 1.12, col: palette.waveLayers[12], lw: 0.9 }
        ];

        const step = Math.max(3, Math.floor(w / 140));
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const L of layers) {
            ctx.beginPath();
            for (let x = 0; x <= w; x += step) {
                const nx = x * L.f + t * L.s;
                const yy =
                    h * L.base +
                    L.amp *
                        (0.52 * Math.sin(nx) +
                            0.28 * Math.sin(nx * 2.15 + 0.6) +
                            0.2 * Math.sin(nx * 0.48 + 1.1));
                if (x === 0) ctx.moveTo(x, yy);
                else ctx.lineTo(x, yy);
            }
            ctx.strokeStyle = L.col;
            ctx.lineWidth = L.lw;
            ctx.stroke();
        }

        ctx.globalAlpha = 0.42;
        ctx.strokeStyle = palette.fineWaveA;
        ctx.lineWidth = 0.85;
        for (let k = 0; k < 8; k++) {
            const yOff = k * 0.065;
            const f = 0.017 + k * 0.0042;
            ctx.beginPath();
            for (let x = 0; x <= w; x += step) {
                const nx = x * f + t * (0.48 + k * 0.14) + k * 1.7;
                const yy = h * (0.1 + yOff) + 8 * Math.sin(nx) + 4.5 * Math.sin(nx * 1.85 + k * 0.3);
                if (x === 0) ctx.moveTo(x, yy);
                else ctx.lineTo(x, yy);
            }
            ctx.stroke();
        }

        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = palette.fineWaveB;
        ctx.lineWidth = 0.65;
        for (let k = 0; k < 6; k++) {
            const yOff = k * 0.08 + 0.04;
            const f = 0.026 + k * 0.005;
            ctx.beginPath();
            for (let x = 0; x <= w; x += step) {
                const nx = x * f + t * (-0.35 + k * 0.12) + k * 2.4;
                const yy =
                    h * (0.52 + yOff * 0.35) +
                    11 * Math.sin(nx * 0.9) +
                    6 * Math.sin(nx * 1.6 + 0.8);
                if (x === 0) ctx.moveTo(x, yy);
                else ctx.lineTo(x, yy);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawAxes(ctx, w, h, palette) {
        const pl = 44;
        const pr = 14;
        const pt = 16;
        const pb = 28;
        ctx.strokeStyle = palette.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pl, yMap(1, pt, pb, h));
        ctx.lineTo(pl, yMap(0, pt, pb, h));
        ctx.lineTo(w - pr, yMap(0, pt, pb, h));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w - pr, yMap(0, pt, pb, h));
        ctx.lineTo(w - pr - 6, yMap(0, pt, pb, h) - 3);
        ctx.moveTo(w - pr, yMap(0, pt, pb, h));
        ctx.lineTo(w - pr - 6, yMap(0, pt, pb, h) + 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pl, yMap(0, pt, pb, h));
        ctx.lineTo(pl - 3, yMap(0, pt, pb, h) + 6);
        ctx.moveTo(pl, yMap(0, pt, pb, h));
        ctx.lineTo(pl + 3, yMap(0, pt, pb, h) + 6);
        ctx.stroke();
        ctx.fillStyle = palette.legendText;
        ctx.font = '13px Source Sans 3, system-ui, sans-serif';
        ctx.fillText('time', w - pr - 36, h - 8);
        ctx.save();
        ctx.translate(28, h / 2 + 22);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('joint', 0, 0);
        ctx.restore();
        return { pl, pr, pt, pb };
    }

    function drawSeries(ctx, w, h, cuts, seed, color, lineWidth, dash, streamTag, palette) {
        const pl = 44;
        const pr = 14;
        const pt = 16;
        const pb = 28;
        ctx.beginPath();
        const n = 220;
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const x = xMap(t, pl, pr, w);
            const y = yMapData(seriesY(t, seed), pt, pb, h);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash || []);
        ctx.stroke();
        ctx.setLineDash([]);

        /* Short cut ticks: centered on the series at this t, not full height (no axis overlap) */
        const plotTop = yMap(1, pt, pb, h);
        const plotBot = yMap(0, pt, pb, h);
        const tickHalf = Math.min(12, Math.max(5, (plotBot - plotTop) * 0.03));
        for (let j = 1; j < cuts.length - 1; j++) {
            const t = cuts[j];
            const x = xMap(t, pl, pr, w);
            const yMid = yMapData(seriesY(t, seed), pt, pb, h);
            let y0 = yMid - tickHalf;
            let y1 = yMid + tickHalf;
            y0 = Math.max(plotTop + 5, y0);
            y1 = Math.min(plotBot - 8, y1);
            if (y1 <= y0 + 2) continue;
            ctx.beginPath();
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y1);
            ctx.strokeStyle = palette.cut;
            ctx.lineWidth = 1.15;
            ctx.stroke();
            /* Same shape as right panel: A○ B□ C△ on the curve at each cut */
            if (streamTag) {
                drawStreamMarker(ctx, x, yMid, streamTag, palette, 0.78);
            }
        }
    }

    let phase = 0;
    let animT = 0;

    function drawSource() {
        const palette = getTrajectoryPalette();
        const w = Ws;
        const h = Hs;
        ctxS.clearRect(0, 0, w, h);
        drawWaveBackdrop(ctxS, w, h, phase * 0.014, palette);
        const pad = drawAxes(ctxS, w, h, palette);
        const { pl, pr, pt, pb } = pad;
        ctxS.save();
        ctxS.beginPath();
        const inset = 1;
        ctxS.rect(pl + inset, pt + inset, w - pl - pr - 2 * inset, h - pt - pb - 2 * inset);
        ctxS.clip();
        const pulse = 0.75 + 0.25 * Math.sin(phase * 0.035);
        drawSeries(ctxS, w, h, cutsA, 0, palette.A, 1.65 * pulse, [], 'A', palette);
        drawSeries(ctxS, w, h, cutsB, 1, palette.B, 1.45 * pulse, [5, 4], 'B', palette);
        drawSeries(ctxS, w, h, cutsC, 2, palette.C, 1.45 * pulse, [2, 5], 'C', palette);
        ctxS.restore();
        drawShapeLegend(ctxS, w, palette);
    }

    function drawGen() {
        const palette = getTrajectoryPalette();
        const w = Wg;
        const h = Hg;
        ctxG.clearRect(0, 0, w, h);
        drawWaveBackdrop(ctxG, w, h, phase * 0.014 + 1.7, palette);
        const pad = drawAxes(ctxG, w, h, palette);
        const { pl, pr, pt, pb } = pad;
        const nShow = Math.min(genCurve.length, Math.max(2, Math.floor(animT * genCurve.length)));
        ctxG.save();
        ctxG.beginPath();
        const inset = 1;
        ctxG.rect(pl + inset, pt + inset, w - pl - pr - 2 * inset, h - pt - pb - 2 * inset);
        ctxG.clip();

        function strokeCurve(curve, nCap, strokeStyle, lineWidth, shadow) {
            if (curve.length < 2) return;
            ctxG.beginPath();
            const lim = Math.min(curve.length, nCap);
            for (let i = 0; i < lim; i++) {
                const p = curve[i];
                const x = xMap(p.x, pl, pr, w);
                const y = yMapData(p.y, pt, pb, h);
                if (i === 0) ctxG.moveTo(x, y);
                else ctxG.lineTo(x, y);
            }
            ctxG.strokeStyle = strokeStyle;
            ctxG.lineWidth = lineWidth;
            if (shadow) {
                ctxG.shadowColor = shadow.color;
                ctxG.shadowBlur = shadow.blur;
            } else {
                ctxG.shadowBlur = 0;
            }
            ctxG.stroke();
            ctxG.shadowBlur = 0;
        }

        ghostGenCurves.forEach((ghost, g) => {
            strokeCurve(ghost, ghost.length, palette.ghostCurve(g), 1.05, null);
        });

        strokeCurve(genCurve, nShow, palette.gen, 2.5, {
            color: palette.genShadow,
            blur: 4
        });

        const n = stitched.length;
        stitched.forEach((s, i) => {
            const tx = n <= 1 ? 0 : i / (n - 1);
            const x = xMap(tx, pl, pr, w);
            const y = yMapData(s.y, pt, pb, h);
            const tag = s.tag || 'A';
            drawStreamMarker(ctxG, x, y, tag, palette, 1);
        });
        ctxG.restore();

        drawShapeLegend(ctxG, w, palette);
        drawGenManyHint(ctxG, w, h, pl, pt, pb, palette);

        if (animT > 0.94) {
            drawCheckerBadge(ctxG, w, h, palette);
        }
    }

    function frame() {
        phase += 1;
        animT += 0.0035;
        if (animT > 1.08) animT = 0;
        drawSource();
        drawGen();
        requestAnimationFrame(frame);
    }

    function resize() {
        const rs = canvasSource.parentElement.getBoundingClientRect();
        const rg = canvasGen.parentElement.getBoundingClientRect();
        Ws = Math.max(280, Math.floor(rs.width));
        Wg = Math.max(280, Math.floor(rg.width));
        ctxS = applyCanvasSize(canvasSource, Ws, Hs);
        ctxG = applyCanvasSize(canvasGen, Wg, Hg);
    }

    ctxS = applyCanvasSize(canvasSource, Ws, Hs);
    ctxG = applyCanvasSize(canvasGen, Wg, Hg);
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(frame);
})();
