import * as THREE from 'three';

// Paints the ground under the city (steppe, paved urban fabric, parks, water,
// roads) onto a large canvas used as the detailed terrain's colour map.
export function paintGround(terrain, data, maxSize) {
  const g = terrain.inner;
  const w = g.maxX - g.minX, d = g.maxZ - g.minZ;
  const H = maxSize, W = Math.round((maxSize * w) / d);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const sx = W / w, sz = H / d;
  const X = (x) => (x / 10 - g.minX) * sx;
  const Z = (z) => (z / 10 - g.minZ) * sz;

  // Base: dry Anatolian steppe with large-scale variation.
  ctx.fillStyle = '#b39d74';
  ctx.fillRect(0, 0, W, H);
  const rnd = mulberry(7);
  for (let i = 0; i < 2500; i++) {
    const r = 20 + rnd() * 120;
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '150,128,88' : '196,176,132'},${0.05 + rnd() * 0.08})`;
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const path = (arr, start) => {
    ctx.beginPath();
    ctx.moveTo(X(arr[start]), Z(arr[start + 1]));
    for (let i = start + 2; i < arr.length; i += 2) ctx.lineTo(X(arr[i]), Z(arr[i + 1]));
  };

  // One Path2D holding every building footprint, reused for several layers.
  const footprints = new Path2D();
  for (const b of data.buildings) {
    footprints.moveTo(X(b[5]), Z(b[6]));
    for (let i = 7; i < b.length; i += 2) footprints.lineTo(X(b[i]), Z(b[i + 1]));
    footprints.closePath();
  }

  // Urban fabric: paved/courtyard ground spreading around every building. Drawn at
  // low resolution and upscaled, which softens it far more cheaply than a blur filter.
  const lowScale = 1 / 8;
  const low = document.createElement('canvas');
  low.width = Math.ceil(W * lowScale); low.height = Math.ceil(H * lowScale);
  const lctx = low.getContext('2d');
  lctx.scale(lowScale, lowScale);
  lctx.fillStyle = lctx.strokeStyle = '#a49c90';
  lctx.lineWidth = 18 * sx;
  lctx.lineJoin = 'round';
  lctx.fill(footprints);
  lctx.stroke(footprints);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 0.92;
  ctx.drawImage(low, 0, 0, W, H);
  ctx.globalAlpha = 1;

  // Green areas, pitches, plazas and water.
  const AREA_STYLE = ['#6f7d45', '#8a8f55', '#55663a', '#8c8a5c', '#3d6a80', '#6c8a4a', '#cfc3ab'];
  for (const a of data.areas) {
    ctx.fillStyle = AREA_STYLE[a[0]];
    path(a, 1);
    ctx.closePath();
    ctx.fill();
    if (a[0] === 4) {
      ctx.strokeStyle = 'rgba(205,195,170,0.9)';
      ctx.lineWidth = 1.5 * sx;
      ctx.stroke();
    }
  }

  // Roads: sidewalk edge, asphalt, then centre markings on the big ones.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const order = data.roads.slice().sort((a, b) => b[0] - a[0]);
  for (const pass of ['kerb', 'asphalt']) {
    for (const r of order) {
      const cls = r[0], width = r[1] / 10;
      if (cls === 7) {
        if (pass !== 'asphalt') continue;
        ctx.strokeStyle = '#c9bea6';
        ctx.lineWidth = width * sx;
      } else if (cls === 8) {
        ctx.strokeStyle = pass === 'kerb' ? '#7d756a' : '#5d564f';
        ctx.lineWidth = (pass === 'kerb' ? width + 2 : width - 2) * sx;
      } else if (cls === 6) {
        if (pass !== 'asphalt') continue;
        ctx.strokeStyle = '#d2c7b1';
        ctx.lineWidth = width * sx;
      } else {
        ctx.strokeStyle = pass === 'kerb' ? '#b8b0a2' : '#4b4a4c';
        ctx.lineWidth = (pass === 'kerb' ? width + 4 : width) * sx;
      }
      path(r, 2);
      ctx.stroke();
    }
  }
  ctx.setLineDash([3 * sx, 4 * sx]);
  ctx.strokeStyle = 'rgba(235,230,215,0.75)';
  ctx.lineWidth = 0.35 * sx;
  for (const r of order) {
    if (r[0] > 2) continue;
    path(r, 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Building contact shadow ("ambient occlusion" at the foot of walls).
  ctx.fillStyle = 'rgba(45,38,32,0.55)';
  ctx.strokeStyle = 'rgba(45,38,32,0.25)';
  ctx.lineWidth = 2.5 * sx;
  ctx.stroke(footprints);
  ctx.fill(footprints);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
