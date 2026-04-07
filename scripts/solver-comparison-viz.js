/**
 * Side-by-side cloth-like particle grids: naive VBD (slow global propagation)
 * vs deformation-stable solver (adaptive edge coupling when strain exceeds threshold).
 */
(function () {
    'use strict';

    const COLS = 14;
    const ROWS = 12;

    function getSolverPalette(mode) {
        const isLight = document.body.classList.contains('theme-light');
        if (isLight) {
            return mode === 'naive'
                ? {
                      bg: ['#f7efe2', '#f1e6d6', '#eadfce'],
                      restStroke: 'rgba(120, 101, 78, 0.16)',
                      restFill: 'rgba(129, 108, 84, 0.18)',
                      stableBaseEdge: 'rgba(120, 150, 138, 0.28)',
                      activeEdge: (t) => `rgba(84, 168, 148, ${0.34 + t * 0.46})`,
                      activeShadow: 'rgba(94, 162, 148, 0.32)',
                      activeDot: 'rgba(207, 151, 84, 0.74)',
                      grabbedHalo: 'rgba(116, 181, 212, 0.16)',
                      grabbedFill: 'rgba(100, 170, 206, 0.92)',
                      grabbedStroke: 'rgba(214, 239, 248, 0.92)',
                      cornerHalo: 'rgba(208, 138, 79, 0.16)',
                      cornerFill: 'rgba(204, 143, 88, 0.92)',
                      cornerStroke: 'rgba(235, 206, 172, 0.92)',
                      particlePin: 'rgba(140, 124, 104, 0.44)',
                      particle: 'rgba(124, 112, 132, 0.7)',
                      guideLine: 'rgba(192, 127, 72, 0.28)',
                      guideDot: 'rgba(208, 135, 81, 0.22)',
                      dragLine: 'rgba(92, 164, 198, 0.34)'
                  }
                : {
                      bg: ['#f2eadc', '#ece2d1', '#e5dac9'],
                      restStroke: 'rgba(118, 99, 74, 0.15)',
                      restFill: 'rgba(129, 108, 84, 0.17)',
                      stableBaseEdge: 'rgba(110, 150, 136, 0.28)',
                      activeEdge: (t) => `rgba(70, 162, 140, ${0.34 + t * 0.48})`,
                      activeShadow: 'rgba(82, 150, 138, 0.3)',
                      activeDot: 'rgba(201, 146, 81, 0.78)',
                      grabbedHalo: 'rgba(116, 181, 212, 0.16)',
                      grabbedFill: 'rgba(100, 170, 206, 0.92)',
                      grabbedStroke: 'rgba(214, 239, 248, 0.92)',
                      cornerHalo: 'rgba(208, 138, 79, 0.16)',
                      cornerFill: 'rgba(204, 143, 88, 0.92)',
                      cornerStroke: 'rgba(235, 206, 172, 0.92)',
                      particlePin: 'rgba(140, 124, 104, 0.44)',
                      particle: 'rgba(124, 112, 132, 0.7)',
                      guideLine: 'rgba(192, 127, 72, 0.28)',
                      guideDot: 'rgba(208, 135, 81, 0.22)',
                      dragLine: 'rgba(92, 164, 198, 0.34)'
                  };
        }

        return mode === 'naive'
            ? {
                  bg: ['#0c0e18', '#0a0d14', '#080a10'],
                  restStroke: 'rgba(72, 88, 128, 0.14)',
                  restFill: 'rgba(90, 105, 145, 0.16)',
                  stableBaseEdge: 'rgba(130, 195, 185, 0.26)',
                  activeEdge: (t) => `rgba(95, 235, 215, ${0.35 + t * 0.5})`,
                  activeShadow: 'rgba(80, 220, 200, 0.55)',
                  activeDot: 'rgba(255, 200, 120, 0.85)',
                  grabbedHalo: 'rgba(100, 220, 255, 0.18)',
                  grabbedFill: 'rgba(140, 235, 255, 0.95)',
                  grabbedStroke: 'rgba(200, 250, 255, 0.95)',
                  cornerHalo: 'rgba(255, 160, 90, 0.22)',
                  cornerFill: 'rgba(255, 190, 130, 0.95)',
                  cornerStroke: 'rgba(255, 220, 180, 0.9)',
                  particlePin: 'rgba(160, 175, 210, 0.55)',
                  particle: 'rgba(200, 210, 235, 0.75)',
                  guideLine: 'rgba(255, 140, 90, 0.35)',
                  guideDot: 'rgba(255, 120, 80, 0.25)',
                  dragLine: 'rgba(120, 230, 255, 0.4)'
              }
            : {
                  bg: ['#0a1018', '#081018', '#060c14'],
                  restStroke: 'rgba(72, 88, 128, 0.14)',
                  restFill: 'rgba(90, 105, 145, 0.16)',
                  stableBaseEdge: 'rgba(130, 195, 185, 0.26)',
                  activeEdge: (t) => `rgba(95, 235, 215, ${0.35 + t * 0.5})`,
                  activeShadow: 'rgba(80, 220, 200, 0.55)',
                  activeDot: 'rgba(255, 200, 120, 0.85)',
                  grabbedHalo: 'rgba(100, 220, 255, 0.18)',
                  grabbedFill: 'rgba(140, 235, 255, 0.95)',
                  grabbedStroke: 'rgba(200, 250, 255, 0.95)',
                  cornerHalo: 'rgba(255, 160, 90, 0.22)',
                  cornerFill: 'rgba(255, 190, 130, 0.95)',
                  cornerStroke: 'rgba(255, 220, 180, 0.9)',
                  particlePin: 'rgba(160, 175, 210, 0.55)',
                  particle: 'rgba(200, 210, 235, 0.75)',
                  guideLine: 'rgba(255, 140, 90, 0.35)',
                  guideDot: 'rgba(255, 120, 80, 0.25)',
                  dragLine: 'rgba(120, 230, 255, 0.4)'
              };
    }

    function makeSim(canvas, mode) {
        const ctx = canvas.getContext('2d');
        let wCss = 400;
        let hCss = 360;
        let dpr = 1;

        const cols = COLS;
        const rows = ROWS;
        const n = cols * rows;

        const px = new Float32Array(n);
        const py = new Float32Array(n);
        const ox = new Float32Array(n);
        const oy = new Float32Array(n);
        const restX = new Float32Array(n);
        const restY = new Float32Array(n);
        const pin = new Uint8Array(n);

        const edges = [];
        let edgeRest = null;

        const edgeActive = [];
        const edgeActiveT = [];

        function idx(i, j) {
            return i + j * cols;
        }

        const pullL = idx(0, 0);
        const pullR = idx(cols - 1, 0);

        function buildMesh() {
            edges.length = 0;
            edgeActive.length = 0;
            edgeActiveT.length = 0;
            const sx = wCss * 0.78;
            const sy = hCss * 0.72;
            const ox0 = (wCss - sx) * 0.5;
            const oy0 = hCss * 0.12;
            const dx = sx / (cols - 1);
            const dy = sy / (rows - 1);

            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < cols; i++) {
                    const k = idx(i, j);
                    const x = ox0 + i * dx;
                    const y = oy0 + j * dy;
                    restX[k] = x;
                    restY[k] = y;
                    px[k] = x;
                    py[k] = y;
                    ox[k] = x;
                    oy[k] = y;
                    pin[k] = 0;
                }
            }

            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < cols; i++) {
                    if (i < cols - 1) {
                        const a = idx(i, j);
                        const b = idx(i + 1, j);
                        const L = Math.hypot(restX[b] - restX[a], restY[b] - restY[a]);
                        edges.push({ a, b, L });
                        edgeActive.push(0);
                        edgeActiveT.push(0);
                    }
                    if (j < rows - 1) {
                        const a = idx(i, j);
                        const b = idx(i, j + 1);
                        const L = Math.hypot(restX[b] - restX[a], restY[b] - restY[a]);
                        edges.push({ a, b, L });
                        edgeActive.push(0);
                        edgeActiveT.push(0);
                    }
                }
            }
            edgeRest = edges.length;
            /* No pinned boundary — COM is stabilized each frame instead. */
        }

        function resize() {
            const rect = canvas.getBoundingClientRect();
            wCss = Math.max(320, rect.width);
            hCss = Math.max(300, rect.height > 8 ? rect.height * 0.98 : 340);
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(wCss * dpr);
            canvas.height = Math.floor(hCss * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            buildMesh();
        }

        /* Naive: few weak passes + slack (tolerate large length errors before correcting) → violent stretch. */
        const NAIVE_ITERS = 1;
        const NAIVE_STIFF = 0.011;
        /** Relative edge-length deviation below this is ignored by the naive solver (allows big elastic stretch). */
        const NAIVE_SLACK = 0.062;
        const NAIVE_CORR_SCALE = 0.42;
        /* Stable: many global passes + strain-gated locals + post-smoothing → mesh moves more as a whole. */
        const STABLE_BASE_ITERS = 14;
        const STABLE_STIFF = 0.46;
        const STABLE_POST_ITERS = 6;
        const STABLE_POST_STIFF = 0.36;
        const STABLE_LOCAL_ITERS = 22;
        const STABLE_LOCAL_STIFF = 0.94;
        const STRAIN_THRESH = 0.0065;
        const DT = 0.48;
        const DAMP_NAIVE = 0.972;
        const DAMP_STABLE = 0.993;
        const PULL_GAIN = 0.02;

        let t = 0;
        let phase = 0;

        let manualMode = false;
        let grabIdx = -1;
        let grabMx = 0;
        let grabMy = 0;
        let pointerDown = false;
        const MANUAL_GAIN = 0.052;
        const PICK_RADIUS = 22;

        function integrate() {
            t += 0.016;
            phase += 0.018;
            const amp = 56;
            const offX = Math.sin(phase * 1.05) * amp + Math.cos(phase * 0.32) * 22;
            const offY = Math.cos(phase * 0.88) * 48 + Math.sin(phase * 0.48) * 20;
            const txL = restX[pullL] + offX;
            const tyL = restY[pullL] + offY;
            const txR = restX[pullR] + offX;
            const tyR = restY[pullR] + offY;

            const damp = mode === 'naive' ? DAMP_NAIVE : DAMP_STABLE;

            for (let k = 0; k < n; k++) {
                if (pin[k]) {
                    px[k] = restX[k];
                    py[k] = restY[k];
                    ox[k] = px[k];
                    oy[k] = py[k];
                    continue;
                }
                let vx = (px[k] - ox[k]) * damp;
                let vy = (py[k] - oy[k]) * damp;
                ox[k] = px[k];
                oy[k] = py[k];

                if (manualMode) {
                    if (grabIdx >= 0 && pointerDown && k === grabIdx) {
                        const ax = (grabMx - px[k]) * MANUAL_GAIN;
                        const ay = (grabMy - py[k]) * MANUAL_GAIN;
                        vx += ax * DT;
                        vy += ay * DT;
                    }
                } else if (k === pullL) {
                    const ax = (txL - px[k]) * PULL_GAIN;
                    const ay = (tyL - py[k]) * PULL_GAIN;
                    vx += ax * DT;
                    vy += ay * DT;
                } else if (k === pullR) {
                    const ax = (txR - px[k]) * PULL_GAIN;
                    const ay = (tyR - py[k]) * PULL_GAIN;
                    vx += ax * DT;
                    vy += ay * DT;
                }

                px[k] += vx;
                py[k] += vy;
            }

            let rcx = 0;
            let rcy = 0;
            for (let k = 0; k < n; k++) {
                rcx += px[k];
                rcy += py[k];
            }
            rcx /= n;
            rcy /= n;
            let ocx = 0;
            let ocy = 0;
            for (let k = 0; k < n; k++) {
                ocx += restX[k];
                ocy += restY[k];
            }
            ocx /= n;
            ocy /= n;
            const fx = ocx - rcx;
            const fy = ocy - rcy;
            for (let k = 0; k < n; k++) {
                px[k] += fx;
                py[k] += fy;
                ox[k] += fx;
                oy[k] += fy;
            }
        }

        function projectEdge(a, b, L0, stiffness) {
            const ax = px[a];
            const ay = py[a];
            const bx = px[b];
            const by = py[b];
            let dx = bx - ax;
            let dy = by - ay;
            const len = Math.hypot(dx, dy) || 1e-8;
            const relErr = (len - L0) / L0;
            if (mode === 'naive' && Math.abs(relErr) < NAIVE_SLACK) {
                return;
            }
            const err = (len - L0) / len;
            let s = stiffness * 0.5 * err;
            if (mode === 'naive') {
                s *= NAIVE_CORR_SCALE;
            }
            dx *= s;
            dy *= s;
            if (!pin[a]) {
                px[a] += dx;
                py[a] += dy;
            }
            if (!pin[b]) {
                px[b] -= dx;
                py[b] -= dy;
            }
        }

        function gsPass(stiffness) {
            for (let e = 0; e < edgeRest; e++) {
                projectEdge(edges[e].a, edges[e].b, edges[e].L, stiffness);
            }
        }

        function strainOf(e) {
            const ed = edges[e];
            const dx = px[ed.b] - px[ed.a];
            const dy = py[ed.b] - py[ed.a];
            const len = Math.hypot(dx, dy) || 1e-8;
            return Math.abs(len - ed.L) / ed.L;
        }

        function solveNaive() {
            for (let it = 0; it < NAIVE_ITERS; it++) {
                gsPass(NAIVE_STIFF);
            }
        }

        function solveStable() {
            for (let it = 0; it < STABLE_BASE_ITERS; it++) {
                gsPass(STABLE_STIFF);
            }
            for (let e = 0; e < edgeRest; e++) {
                const s = strainOf(e);
                if (s > STRAIN_THRESH) {
                    edgeActive[e] = 1;
                    edgeActiveT[e] = 1;
                    for (let k = 0; k < STABLE_LOCAL_ITERS; k++) {
                        projectEdge(edges[e].a, edges[e].b, edges[e].L, STABLE_LOCAL_STIFF);
                    }
                }
            }
            for (let it = 0; it < STABLE_POST_ITERS; it++) {
                gsPass(STABLE_POST_STIFF);
            }
            for (let e = 0; e < edgeRest; e++) {
                if (edgeActiveT[e] > 0) {
                    edgeActiveT[e] *= 0.88;
                    if (edgeActiveT[e] < 0.06) edgeActive[e] = 0;
                }
            }
        }

        function drawBackground() {
            const palette = getSolverPalette(mode);
            const g = ctx.createLinearGradient(0, 0, wCss, hCss);
            g.addColorStop(0, palette.bg[0]);
            g.addColorStop(0.5, palette.bg[1]);
            g.addColorStop(1, palette.bg[2]);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, wCss, hCss);
        }

        function drawRestLattice() {
            const palette = getSolverPalette(mode);
            ctx.strokeStyle = palette.restStroke;
            ctx.lineWidth = 0.85;
            for (let e = 0; e < edgeRest; e++) {
                const ed = edges[e];
                ctx.beginPath();
                ctx.moveTo(restX[ed.a], restY[ed.a]);
                ctx.lineTo(restX[ed.b], restY[ed.b]);
                ctx.stroke();
            }
            ctx.fillStyle = palette.restFill;
            for (let k = 0; k < n; k++) {
                ctx.beginPath();
                ctx.arc(restX[k], restY[k], 1.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function draw() {
            const palette = getSolverPalette(mode);
            drawBackground();
            drawRestLattice();

            ctx.shadowBlur = 0;
            ctx.lineWidth = 1;

            for (let e = 0; e < edgeRest; e++) {
                if (mode === 'stable' && edgeActive[e] > 0) continue;
                const ed = edges[e];
                ctx.beginPath();
                ctx.moveTo(px[ed.a], py[ed.a]);
                ctx.lineTo(px[ed.b], py[ed.b]);
                if (mode === 'naive') {
                    const s = strainOf(e);
                    const u = Math.min(1, s / 0.2);
                    if (document.body.classList.contains('theme-light')) {
                        ctx.strokeStyle = `rgba(${Math.round(181 + u * 24)}, ${Math.round(144 - u * 18)}, ${Math.round(
                            118 - u * 22
                        )}, ${0.24 + u * 0.34})`;
                    } else {
                        ctx.strokeStyle = `rgba(${Math.round(140 + u * 115)}, ${Math.round(155 - u * 70)}, ${Math.round(
                            210 - u * 90
                        )}, ${0.28 + u * 0.42})`;
                    }
                    ctx.lineWidth = 0.85 + u * 1.35;
                } else {
                    ctx.strokeStyle = palette.stableBaseEdge;
                    ctx.lineWidth = 1;
                }
                ctx.stroke();
            }

            if (mode === 'stable') {
                for (let e = 0; e < edgeRest; e++) {
                    if (edgeActive[e] <= 0 || edgeActiveT[e] < 0.04) continue;
                    const ed = edges[e];
                    const t = edgeActiveT[e];
                    ctx.strokeStyle = palette.activeEdge(t);
                    ctx.shadowColor = palette.activeShadow;
                    ctx.shadowBlur = 6 + t * 10;
                    ctx.lineWidth = 1.25 + t * 1.4;
                    ctx.beginPath();
                    ctx.moveTo(px[ed.a], py[ed.a]);
                    ctx.lineTo(px[ed.b], py[ed.b]);
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;
            }

            if (mode === 'stable') {
                ctx.fillStyle = palette.activeDot;
                for (let e = 0; e < edgeRest; e++) {
                    if (edgeActive[e] <= 0 || edgeActiveT[e] < 0.08) continue;
                    const ed = edges[e];
                    const mx = (px[ed.a] + px[ed.b]) * 0.5;
                    const my = (py[ed.a] + py[ed.b]) * 0.5;
                    const r = 2.2 + edgeActiveT[e] * 2.5;
                    ctx.beginPath();
                    ctx.arc(mx, my, r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            for (let k = 0; k < n; k++) {
                const x = px[k];
                const y = py[k];
                const grabbed = manualMode && pointerDown && grabIdx >= 0 && k === grabIdx;
                const cornerDrive = !manualMode && (k === pullL || k === pullR);
                if (grabbed) {
                    ctx.beginPath();
                    ctx.arc(x, y, 9, 0, Math.PI * 2);
                    ctx.fillStyle = palette.grabbedHalo;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(x, y, 5, 0, Math.PI * 2);
                    ctx.fillStyle = palette.grabbedFill;
                    ctx.fill();
                    ctx.strokeStyle = palette.grabbedStroke;
                    ctx.lineWidth = 1.2;
                    ctx.stroke();
                } else if (cornerDrive) {
                    ctx.beginPath();
                    ctx.arc(x, y, 7, 0, Math.PI * 2);
                    ctx.fillStyle = palette.cornerHalo;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
                    ctx.fillStyle = palette.cornerFill;
                    ctx.fill();
                    ctx.strokeStyle = palette.cornerStroke;
                    ctx.lineWidth = 1.2;
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.arc(x, y, pin[k] ? 2.4 : 2.1, 0, Math.PI * 2);
                    ctx.fillStyle = pin[k] ? palette.particlePin : palette.particle;
                    ctx.fill();
                }
            }

            if (!manualMode) {
                const amp = 56;
                const offX = Math.sin(phase * 1.05) * amp + Math.cos(phase * 0.32) * 22;
                const offY = Math.cos(phase * 0.88) * 48 + Math.sin(phase * 0.48) * 20;
                const txL = restX[pullL] + offX;
                const tyL = restY[pullL] + offY;
                const txR = restX[pullR] + offX;
                const tyR = restY[pullR] + offY;
                ctx.setLineDash([4, 6]);
                ctx.strokeStyle = palette.guideLine;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(px[pullL], py[pullL]);
                ctx.lineTo(txL, tyL);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(px[pullR], py[pullR]);
                ctx.lineTo(txR, tyR);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = palette.guideDot;
                ctx.beginPath();
                ctx.arc(txL, tyL, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(txR, tyR, 4, 0, Math.PI * 2);
                ctx.fill();
            } else if (pointerDown && grabIdx >= 0) {
                ctx.setLineDash([4, 6]);
                ctx.strokeStyle = palette.dragLine;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(px[grabIdx], py[grabIdx]);
                ctx.lineTo(grabMx, grabMy);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        function reset() {
            for (let k = 0; k < n; k++) {
                px[k] = restX[k];
                py[k] = restY[k];
                ox[k] = restX[k];
                oy[k] = restY[k];
            }
            for (let e = 0; e < edgeRest; e++) {
                edgeActive[e] = 0;
                edgeActiveT[e] = 0;
            }
            t = 0;
            phase = 0;
            grabIdx = -1;
            pointerDown = false;
        }

        function setManualMode(on) {
            manualMode = !!on;
            if (!manualMode) {
                grabIdx = -1;
                pointerDown = false;
            }
        }

        function pickParticleAt(cx, cy) {
            const r2 = PICK_RADIUS * PICK_RADIUS;
            let best = -1;
            let bestD = 1e12;
            for (let k = 0; k < n; k++) {
                const dx = px[k] - cx;
                const dy = py[k] - cy;
                const d2 = dx * dx + dy * dy;
                if (d2 <= r2 && d2 < bestD) {
                    bestD = d2;
                    best = k;
                }
            }
            return best;
        }

        function onPointerDown(cx, cy) {
            if (!manualMode) return false;
            const p = pickParticleAt(cx, cy);
            grabIdx = p;
            grabMx = cx;
            grabMy = cy;
            pointerDown = p >= 0;
            return pointerDown;
        }

        function onPointerMove(cx, cy) {
            if (!manualMode || !pointerDown) return;
            grabMx = cx;
            grabMy = cy;
        }

        function onPointerUp() {
            pointerDown = false;
            grabIdx = -1;
        }

        function step() {
            integrate();
            if (mode === 'naive') {
                solveNaive();
            } else {
                solveStable();
            }
            draw();
        }

        return {
            resize,
            step,
            reset,
            setManualMode,
            onPointerDown,
            onPointerMove,
            onPointerUp
        };
    }

    function init() {
        const naiveEl = document.getElementById('solverCanvasNaive');
        const stableEl = document.getElementById('solverCanvasStable');
        if (!naiveEl || !stableEl) return;

        const naive = makeSim(naiveEl, 'naive');
        const stable = makeSim(stableEl, 'stable');

        let autoResetId = null;
        let interactiveMode = false;

        function scheduleAutoReset() {
            if (autoResetId !== null) {
                clearInterval(autoResetId);
            }
            autoResetId = window.setInterval(function () {
                naive.reset();
                stable.reset();
            }, 10000);
        }

        function stopAutoReset() {
            if (autoResetId !== null) {
                clearInterval(autoResetId);
                autoResetId = null;
            }
        }

        function resetBoth() {
            naive.reset();
            stable.reset();
        }

        const resetBtn = document.getElementById('solverCompareReset');
        const dragBtn = document.getElementById('solverCompareDragMode');
        const hintEl = document.querySelector('.solver-compare-reset-hint');

        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                resetBoth();
                if (!interactiveMode) {
                    scheduleAutoReset();
                }
            });
        }

        function bindCanvas(canvas, sim) {
            function coords(e) {
                const r = canvas.getBoundingClientRect();
                return { x: e.clientX - r.left, y: e.clientY - r.top };
            }
            canvas.addEventListener('pointerdown', function (e) {
                if (!interactiveMode) return;
                const { x, y } = coords(e);
                if (sim.onPointerDown(x, y)) {
                    e.preventDefault();
                    canvas.setPointerCapture(e.pointerId);
                }
            });
            canvas.addEventListener('pointermove', function (e) {
                if (!interactiveMode) return;
                const { x, y } = coords(e);
                sim.onPointerMove(x, y);
            });
            canvas.addEventListener('pointerup', function (e) {
                sim.onPointerUp();
                try {
                    canvas.releasePointerCapture(e.pointerId);
                } catch (_) {}
            });
            canvas.addEventListener('pointercancel', function (e) {
                sim.onPointerUp();
                try {
                    canvas.releasePointerCapture(e.pointerId);
                } catch (_) {}
            });
        }

        bindCanvas(naiveEl, naive);
        bindCanvas(stableEl, stable);

        if (dragBtn) {
            dragBtn.addEventListener('click', function () {
                interactiveMode = !interactiveMode;
                if (interactiveMode) {
                    stopAutoReset();
                    naive.setManualMode(true);
                    stable.setManualMode(true);
                    resetBoth();
                    dragBtn.classList.add('is-active');
                    dragBtn.setAttribute('aria-pressed', 'true');
                    dragBtn.textContent = 'Exit drag mode';
                    naiveEl.style.cursor = 'grab';
                    stableEl.style.cursor = 'grab';
                    naiveEl.style.touchAction = 'none';
                    stableEl.style.touchAction = 'none';
                    if (hintEl) {
                        hintEl.style.display = 'none';
                    }
                } else {
                    naive.setManualMode(false);
                    stable.setManualMode(false);
                    naiveEl.style.cursor = '';
                    stableEl.style.cursor = '';
                    naiveEl.style.touchAction = '';
                    stableEl.style.touchAction = '';
                    dragBtn.classList.remove('is-active');
                    dragBtn.setAttribute('aria-pressed', 'false');
                    dragBtn.textContent = 'Drag particles';
                    if (hintEl) {
                        hintEl.style.display = '';
                    }
                    scheduleAutoReset();
                }
            });
        }

        scheduleAutoReset();

        function onResize() {
            naive.resize();
            stable.resize();
        }

        window.addEventListener('resize', onResize);
        onResize();

        function loop() {
            naive.step();
            stable.step();
            requestAnimationFrame(loop);
        }
        loop();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
