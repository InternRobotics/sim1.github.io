/**
 * Interactive 3D PCA scatter (three groups), OrbitControls.
 * Colors match Results bar legend (.swatch-real / tele / gen).
 * Positions = raw PCA scores from JSON (no display scaling for now).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DATA_URL = 'data/pca_points_3groups.json';

/** Same RGB as styles.css .swatch-real / .swatch-tele / .swatch-gen */
const GROUP_STYLES = [
    {
        match: (s) => /^real\b/i.test(s) || /real data/i.test(s),
        rgb: [191 / 255, 191 / 255, 191 / 255],
        hex: '#bfbfbf'
    },
    {
        match: (s) => /teleoperated/i.test(s),
        rgb: [202 / 255, 172 / 255, 197 / 255],
        hex: '#caacc5'
    },
    {
        match: (s) => /generated/i.test(s),
        rgb: [128 / 255, 109 / 255, 155 / 255],
        hex: '#806d9b'
    }
];

function styleForLabel(label) {
    for (const st of GROUP_STYLES) {
        if (st.match(label)) return st;
    }
    return GROUP_STYLES[2];
}

function filterKeyForLabel(label) {
    if (/^real\b/i.test(label) || /real data/i.test(label)) return 'real';
    if (/teleoperated/i.test(label)) return 'tele';
    if (/generated/i.test(label)) return 'gen';
    return 'gen';
}

function computeBounds(pointsFlat) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const n = pointsFlat.length / 3;
    for (let i = 0; i < n; i++) {
        const o = i * 3;
        for (let a = 0; a < 3; a++) {
            const v = pointsFlat[o + a];
            if (v < min[a]) min[a] = v;
            if (v > max[a]) max[a] = v;
        }
    }
    return { min, max, n };
}

/**
 * Plotly-style 3D scene: bounding box wireframe + three gridded planes on min-X / min-Y / min-Z
 * faces (similar to scene.xaxis/yaxis/zaxis showbackground in Plotly).
 */
function addPlotlyStyleFrame(scene, min, max, cx, cy, cz, ex, ey, ez, maxSpan) {
    const base = Math.max(ex, ey, ez, 1e-9);
    const divs = Math.min(28, Math.max(10, Math.round(12 + 14 * (base / maxSpan))));
    const c1 = 0x4a5d72;
    const c2 = 0x2a3545;

    const box3 = new THREE.Box3(
        new THREE.Vector3(min[0], min[1], min[2]),
        new THREE.Vector3(max[0], max[1], max[2])
    );
    const boxHelper = new THREE.Box3Helper(box3, 0x6a7d92);
    boxHelper.material.transparent = true;
    boxHelper.material.opacity = 0.85;
    scene.add(boxHelper);

    const sx = ex / base;
    const sy = ey / base;
    const sz = ez / base;

    /* Floor: XZ at y = min (Y-up, like Plotly 3D default). */
    const floor = new THREE.GridHelper(base, divs, c1, c2);
    floor.scale.set(sx, 1, sz);
    floor.position.set(cx, min[1], cz);
    scene.add(floor);

    /* Back wall: XY plane at z = min (facing +Z). */
    const back = new THREE.GridHelper(base, divs, c1, c2);
    back.rotation.x = Math.PI / 2;
    back.scale.set(sx, sy, 1);
    back.position.set(cx, cy, min[2]);
    scene.add(back);

    /* Left wall: YZ at x = min. GridHelper is in XZ; Rz(π/2) maps local X→world Y, local Z→world Z.
     * (Rx+Ry + scale(sy,sz,1) wrongly swapped ey/ez on that face.) */
    const left = new THREE.GridHelper(base, divs, c1, c2);
    left.rotation.z = Math.PI / 2;
    left.scale.set(sy, 1, sz);
    left.position.set(min[0], cy, cz);
    scene.add(left);
}

/** Hard-edge disc for sharper sprites (less blur than radial gradient). */
function makeCircleTexture() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const r = size / 2 - 4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
}

function buildPointsGroup(pointsDisplay, colorRgb, rawFlat, groupLabel, pointSize, opacity, circleMap) {
    const n = pointsDisplay.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const [r, g, b] = colorRgb;
    for (let i = 0; i < n; i++) {
        const o = i * 3;
        positions[o] = pointsDisplay[i][0];
        positions[o + 1] = pointsDisplay[i][1];
        positions[o + 2] = pointsDisplay[i][2];
        colors[o] = r;
        colors[o + 1] = g;
        colors[o + 2] = b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
        size: pointSize,
        map: circleMap,
        vertexColors: true,
        transparent: opacity < 1,
        opacity,
        sizeAttenuation: true,
        depthWrite: false,
        alphaTest: 0.48
    });
    const pts = new THREE.Points(geo, mat);
    pts.userData.groupLabel = groupLabel;
    pts.userData.filterKey = filterKeyForLabel(groupLabel);
    pts.userData.raw = rawFlat;
    return pts;
}

function fillLegend(el, groupsMeta) {
    if (!el) return;
    el.innerHTML = '';
    for (const g of groupsMeta) {
        const row = document.createElement('div');
        row.className = 'pca-legend-row';
        const sw = document.createElement('span');
        sw.className = 'pca-legend-swatch';
        sw.style.background = g.colorHex;
        const lab = document.createElement('span');
        lab.className = 'pca-legend-label';
        lab.textContent = `${g.label} (${g.n.toLocaleString()})`;
        row.appendChild(sw);
        row.appendChild(lab);
        el.appendChild(row);
    }
}

function showPcaError(container, message) {
    container.classList.remove('pca-scatter-canvas--loading');
    container.classList.add('pca-scatter-canvas--error');
    container.innerHTML = '';
    container.textContent = message;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function main() {
    const container = document.getElementById('pcaScatter3d');
    if (!container) return;

    const legendEl = document.getElementById('pcaScatterLegend');

    let data;
    try {
        const r = await fetch(DATA_URL);
        if (!r.ok) throw new Error(String(r.status));
        data = await r.json();
    } catch (e) {
        showPcaError(
            container,
            'Could not load PCA data. If you opened this page as a local file (file://), the browser blocks loading JSON. Use a local server instead: in the Webpage folder run: python3 -m http.server 8000 — then open http://localhost:8000/index.html'
        );
        return;
    }

    let width = container.clientWidth || 900;
    /* W/H ratio = 1 / PCA_H_FRAC; lower frac → wider canvas (larger aspect ratio). */
    const PCA_H_FRAC = 0.6;
    let height = Math.min(580, Math.max(360, Math.floor(width * PCA_H_FRAC)));

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.001, 1e6);
    camera.position.set(0, 0, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    function applySceneTheme() {
        const bg = document.body.classList.contains('theme-light') ? 0xf3e9d8 : 0x080a12;
        scene.background = new THREE.Color(bg);
        if (scene.fog) scene.fog.color = new THREE.Color(bg);
        renderer.setClearColor(bg, 1);
    }
    applySceneTheme();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.65;
    controls.minDistance = 0.01;
    controls.maxDistance = 1e5;
    controls.target.set(0, 0, 0);

    const amb = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(amb);

    const circleMap = makeCircleTexture();
    const pointMeshes = [];
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    raycaster.params.Points.threshold = 0.12;

    const tooltip = document.createElement('div');
    tooltip.className = 'pca-point-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.style.display = 'none';
    container.appendChild(tooltip);

    try {
        const allFlat = [];
        for (const g of data.groups) {
            for (const p of g.points) {
                allFlat.push(p[0], p[1], p[2]);
            }
        }
        const flat = new Float32Array(allFlat);

        const meta = [];
        for (const g of data.groups) {
            const st = styleForLabel(g.label);
            const label = g.label;
            const isGen = /generated/i.test(label);
            const size = isGen ? 0.016 : 0.028;
            const opacity = isGen ? 0.82 : 1;

            const n = g.points.length;
            const rawFlat = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const p = g.points[i];
                const o = i * 3;
                rawFlat[o] = p[0];
                rawFlat[o + 1] = p[1];
                rawFlat[o + 2] = p[2];
            }

            const pts = buildPointsGroup(g.points, st.rgb, rawFlat, label, size, opacity, circleMap);
            scene.add(pts);
            pointMeshes.push(pts);
            meta.push({ label: g.label, n: g.n, colorHex: st.hex });
        }

        const bbox = computeBounds(flat);
        const min = bbox.min;
        const max = bbox.max;
        const cx = (min[0] + max[0]) / 2;
        const cy = (min[1] + max[1]) / 2;
        const cz = (min[2] + max[2]) / 2;
        const ex = max[0] - min[0];
        const ey = max[1] - min[1];
        const ez = max[2] - min[2];
        const maxSpan = Math.max(ex, ey, ez, 1e-9);

        const axesLen = Math.max(maxSpan * 0.38, maxSpan * 0.06);
        scene.add(new THREE.AxesHelper(axesLen));

        addPlotlyStyleFrame(scene, min, max, cx, cy, cz, ex, ey, ez, maxSpan);

        scene.fog = new THREE.Fog(0x080a12, maxSpan * 2.2, maxSpan * 55);
        applySceneTheme();

        const dist = maxSpan * 1.12;
        camera.position.set(cx + dist * 0.55, cy + dist * 0.48, cz + dist * 0.58);
        camera.near = Math.max(maxSpan * 1e-5, 1e-6);
        camera.far = maxSpan * 500;
        camera.updateProjectionMatrix();
        controls.target.set(cx, cy, cz);
        controls.minDistance = maxSpan * 0.02;
        controls.maxDistance = maxSpan * 40;
        controls.update();

        const initialCamPos = camera.position.clone();
        const initialTarget = controls.target.clone();

        raycaster.params.Points.threshold = Math.max(0.04, maxSpan * 0.028);

        const hud = document.createElement('div');
        hud.className = 'pca-scatter-hud';
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'pca-hud-reset';
        resetBtn.textContent = 'Reset view';
        resetBtn.addEventListener('click', () => {
            camera.position.copy(initialCamPos);
            controls.target.copy(initialTarget);
            controls.update();
        });
        hud.appendChild(resetBtn);

        const filterBlock = document.createElement('div');
        filterBlock.className = 'pca-hud-filters';
        const filterTitle = document.createElement('span');
        filterTitle.className = 'pca-hud-filters-title';
        filterTitle.textContent = 'Show';
        filterBlock.appendChild(filterTitle);

        pointMeshes.forEach((mesh) => {
            const row = document.createElement('label');
            row.className = 'pca-hud-filter-row';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.addEventListener('change', () => {
                mesh.visible = cb.checked;
            });
            const span = document.createElement('span');
            span.className = 'pca-hud-filter-text';
            span.textContent = mesh.userData.groupLabel;
            row.appendChild(cb);
            row.appendChild(span);
            filterBlock.appendChild(row);
        });
        hud.appendChild(filterBlock);
        container.appendChild(hud);

        fillLegend(legendEl, meta);

        const visibleMeshes = () => pointMeshes.filter((m) => m.visible);

        const onPointerMove = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            pointerNdc.set(x, y);
            raycaster.setFromCamera(pointerNdc, camera);
            const hits = raycaster.intersectObjects(visibleMeshes(), false);
            if (hits.length > 0) {
                const h = hits[0];
                const idx = h.index;
                if (idx === undefined) {
                    tooltip.style.display = 'none';
                    return;
                }
                const raw = h.object.userData.raw;
                const gx = raw[idx * 3];
                const gy = raw[idx * 3 + 1];
                const gz = raw[idx * 3 + 2];
                const src = h.object.userData.groupLabel;
                tooltip.innerHTML = `<div class="pca-point-tooltip-coords">PC1: ${gx.toFixed(5)} &nbsp; PC2: ${gy.toFixed(5)} &nbsp; PC3: ${gz.toFixed(5)}</div><div class="pca-point-tooltip-src">${escapeHtml(src)}</div>`;
                tooltip.style.display = 'block';
                const cr = container.getBoundingClientRect();
                let left = e.clientX - cr.left + 14;
                let top = e.clientY - cr.top + 14;
                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
                requestAnimationFrame(() => {
                    const tw = tooltip.offsetWidth;
                    const th = tooltip.offsetHeight;
                    if (left + tw > cr.width - 8) left = Math.max(8, cr.width - tw - 8);
                    if (top + th > cr.height - 8) top = Math.max(8, cr.height - th - 8);
                    tooltip.style.left = `${left}px`;
                    tooltip.style.top = `${top}px`;
                });
            } else {
                tooltip.style.display = 'none';
            }
        };

        const onPointerLeave = () => {
            tooltip.style.display = 'none';
        };

        renderer.domElement.addEventListener('pointermove', onPointerMove);
        renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    } catch (e) {
        console.error(e);
        showPcaError(container, 'Failed to build PCA visualization.');
        return;
    }

    container.classList.remove('pca-scatter-canvas--loading');

    function onResize() {
        width = container.clientWidth || 900;
        height = Math.min(580, Math.max(360, Math.floor(width * PCA_H_FRAC)));
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('sim1-themechange', applySceneTheme);

    function tick() {
        requestAnimationFrame(tick);
        controls.update();
        renderer.render(scene, camera);
    }
    tick();
}

main();
