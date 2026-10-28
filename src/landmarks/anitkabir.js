import * as THREE from 'three';
import { centroid, orientedBox, extrudeFootprint, wallAlong, sampleAlong, shadowed, mergeGeometries } from './util.js';

// Anıtkabir: Hall of Honour on its podium, Ceremonial Plaza, Road of Lions and entrance towers.
export function buildAnitkabir({ terrain, lm, mat }) {
  const group = new THREE.Group();
  group.name = 'Anıtkabir';

  const plazaPts = lm.anitkabirPlaza.pts;
  const plazaC = centroid(plazaPts);
  const plazaHeights = plazaPts.map((p) => terrain.heightAt(...p)).sort((a, b) => a - b);
  const yP = plazaHeights[Math.floor(plazaHeights.length * 0.6)] + 0.2;

  // --- Ceremonial Plaza: a level paved slab with the rug-like stone pattern
  const plazaGeo = extrudeFootprint(plazaPts, yP - 6, yP);
  const plazaMat = new THREE.MeshStandardMaterial({ map: plazaTexture(), roughness: 0.7 });
  setPlanarUV(plazaGeo, plazaC, 120);
  group.add(new THREE.Mesh(plazaGeo, plazaMat));

  // --- Hall of Honour
  const box = orientedBox(lm.anitkabirTomb.pts);
  let f = new THREE.Vector2(-Math.sin(box.angle), Math.cos(box.angle));
  if (f.dot(new THREE.Vector2(plazaC[0] - box.cx, plazaC[1] - box.cz)) < 0) f.multiplyScalar(-1);
  const hall = new THREE.Group();
  hall.position.set(box.cx, yP, box.cz);
  hall.rotation.y = Math.atan2(f.x, f.y);
  const L = Math.max(box.length, 60), W = Math.max(box.width, 44);
  const stone = mat.travertinePlain;
  const add = (geo, m = stone) => { const mesh = new THREE.Mesh(geo, m); hall.add(mesh); return mesh; };

  const podiumH = 7.5;
  add(new THREE.BoxGeometry(L + 14, podiumH + 4, W + 14).translate(0, podiumH / 2 - 2, 0), mat.travertine);
  // Grand stairway (42 steps in reality) down to the plaza on the front side
  const steps = 18, rise = podiumH / steps, run = 1.05, stairW = L * 0.62;
  const stairGeos = [];
  for (let i = 0; i < steps; i++) {
    const h = podiumH - i * rise;
    stairGeos.push(new THREE.BoxGeometry(stairW, h, run).translate(0, h / 2, (W + 14) / 2 + run * (i + 0.5)));
  }
  add(mergeGeometries(stairGeos));
  // Flanking stair cheeks with relief panels
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(6, podiumH + 1.2, steps * run + 2).translate(s * (stairW / 2 + 3), (podiumH + 1.2) / 2, (W + 14) / 2 + (steps * run) / 2 - 1), mat.travertine);
  }

  const y0 = podiumH;
  const colH = 14.4;
  // Stylobate
  add(new THREE.BoxGeometry(L + 2, 1, W + 2).translate(0, y0 + 0.5, 0));
  // Cella (inner hall) — darker recess behind the colonnade
  add(new THREE.BoxGeometry(L - 9, colH, W - 9).translate(0, y0 + 1 + colH / 2, 0), new THREE.MeshStandardMaterial({ color: '#cbbb9d', roughness: 0.8 }));
  // Square columns: 14 along the long sides, 8 along the short sides
  const colGeos = [];
  const cs = 1.7;
  const placeRow = (count, from, to, fixed, alongX) => {
    for (let i = 0; i < count; i++) {
      const t = from + ((to - from) * i) / (count - 1);
      const g = new THREE.BoxGeometry(cs, colH, cs);
      g.translate(alongX ? t : fixed, y0 + 1 + colH / 2, alongX ? fixed : t);
      colGeos.push(g);
    }
  };
  const ex = L / 2 - 1, ez = W / 2 - 1;
  placeRow(14, -ex, ex, ez, true);
  placeRow(14, -ex, ex, -ez, true);
  placeRow(8, -ez, ez, ex, false);
  placeRow(8, -ez, ez, -ex, false);
  add(mergeGeometries(colGeos));
  // Entablature, cornice and stepped attic
  const yE = y0 + 1 + colH;
  add(new THREE.BoxGeometry(L + 1, 2.8, W + 1).translate(0, yE + 1.4, 0));
  add(new THREE.BoxGeometry(L + 2.6, 0.6, W + 2.6).translate(0, yE + 3.1, 0));
  add(new THREE.BoxGeometry(L * 0.62, 3.2, W * 0.72).translate(0, yE + 3.4 + 1.6, 0));
  add(new THREE.BoxGeometry(L * 0.64, 0.4, W * 0.74).translate(0, yE + 6.8, 0));
  // Golden inscription bands on the front cheeks (Atatürk's speeches)
  const gold = new THREE.MeshStandardMaterial({ color: '#b8893a', metalness: 0.8, roughness: 0.35 });
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(5, 3.5, 0.2).translate(s * (stairW / 2 + 3), podiumH - 3, (W + 14) / 2 + steps * run + 0.95), gold);
  // Flag mast on the plaza side
  group.add(hall);

  // --- Road of Lions
  let road = lm.anitkabirLionsRoad.pts.slice();
  const d0 = Math.hypot(road[0][0] - plazaC[0], road[0][1] - plazaC[1]);
  const d1 = Math.hypot(road[road.length - 1][0] - plazaC[0], road[road.length - 1][1] - plazaC[1]);
  if (d0 < d1) road.reverse(); // start at the entrance, end at the plaza
  const { geometry: roadGeo } = wallAlong(road, terrain, { height: 0.45, thickness: 21, sink: 3, step: 6 });
  group.add(new THREE.Mesh(roadGeo, mat.paving));

  // 24 lions (12 pairs), Hittite-style, lying on pedestals and facing the mausoleum
  const lionGeo = lionGeometry();
  const lions = new THREE.InstancedMesh(lionGeo, new THREE.MeshStandardMaterial({ color: '#e2d3b5', roughness: 0.75 }), 24);
  const roadLen = road.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - road[i][0], p[1] - road[i][1]), 0);
  const stations = sampleAlong(road, (roadLen - 60) / 11, 25).slice(0, 12);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let k = 0;
  for (const [x, z, a] of stations) {
    const nx = -Math.sin(a), nz = Math.cos(a);
    for (const s of [-1, 1]) {
      const lx = x + nx * 12.2 * s, lz = z + nz * 12.2 * s;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      m.compose(p.set(lx, terrain.heightAt(lx, lz), lz), q, sc);
      lions.setMatrixAt(k++, m);
    }
  }
  lions.count = k;
  group.add(lions);

  // Independence & Freedom towers at the start of the road
  const [sx, sz] = road[0];
  const a0 = Math.atan2(road[1][1] - sz, road[1][0] - sx);
  for (const s of [-1, 1]) {
    const tx = sx + Math.cos(a0) * 6 - Math.sin(a0) * 21 * s;
    const tz = sz + Math.sin(a0) * 6 + Math.cos(a0) * 21 * s;
    const t = tower();
    t.position.set(tx, terrain.heightAt(tx, tz) - 1, tz);
    t.rotation.y = -a0;
    group.add(t);
  }

  shadowed(group);
  const top = new THREE.Vector3(box.cx, yP + podiumH + 25, box.cz);
  return {
    group,
    anchor: top,
    focus: new THREE.Vector3(plazaC[0] * 0.5 + box.cx * 0.5, yP + 8, plazaC[1] * 0.5 + box.cz * 0.5),
    facing: Math.atan2(f.x, f.y),
  };

  function tower() {
    const t = new THREE.Group();
    const s = mat.travertinePlain;
    t.add(new THREE.Mesh(new THREE.BoxGeometry(10, 3, 10).translate(0, 1.5, 0), s));
    t.add(new THREE.Mesh(new THREE.BoxGeometry(8.4, 13, 8.4).translate(0, 9.5, 0), mat.travertine));
    // open belvedere with corner piers
    for (const [px, pz] of [[-3.6, -3.6], [3.6, -3.6], [3.6, 3.6], [-3.6, 3.6]]) {
      t.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 4, 1.2).translate(px, 18, pz), s));
    }
    t.add(new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.6, 6.2).translate(0, 17.8, 0), new THREE.MeshStandardMaterial({ color: '#8c7b63' })));
    t.add(new THREE.Mesh(new THREE.BoxGeometry(9.4, 1, 9.4).translate(0, 20.5, 0), s));
    t.add(new THREE.Mesh(new THREE.ConeGeometry(6.4, 3.4, 4).rotateY(Math.PI / 4).translate(0, 22.7, 0), s));
    return t;
  }
}

function lionGeometry() {
  const parts = [
    new THREE.BoxGeometry(1.6, 1.4, 3.6).translate(0, 0.7, 0), // pedestal
    new THREE.BoxGeometry(1.25, 1.0, 2.5).translate(0, 1.9, -0.2), // body
    new THREE.BoxGeometry(1.35, 1.35, 1.0).translate(0, 2.3, 1.15), // mane / chest
    new THREE.BoxGeometry(0.9, 0.85, 0.8).translate(0, 2.6, 1.75), // head
    new THREE.BoxGeometry(0.3, 0.35, 1.1).translate(-0.45, 1.55, 1.6), // paws
    new THREE.BoxGeometry(0.3, 0.35, 1.1).translate(0.45, 1.55, 1.6),
  ];
  // local +Z is the lion's facing; rotate so it faces +X (along the road direction)
  return mergeGeometries(parts.map((g) => g.toNonIndexed())).rotateY(Math.PI / 2);
}

function setPlanarUV(geo, [cx, cz], scale) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - cx) / scale + 0.5, (p.getZ(i) - cz) / scale + 0.5);
}

function plazaTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ddd0b6';
  ctx.fillRect(0, 0, 1024, 1024);
  // Kilim-like geometric bands of coloured stone
  const cols = ['#b9a68a', '#a28c74', '#c7b597', '#8f7b66'];
  const n = 8, s = 1024 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.strokeStyle = cols[(i + j) % cols.length];
    ctx.lineWidth = 6;
    ctx.strokeRect(i * s + 10, j * s + 10, s - 20, s - 20);
    ctx.fillStyle = cols[(i * 3 + j) % cols.length];
    ctx.beginPath();
    ctx.moveTo(i * s + s / 2, j * s + 26);
    ctx.lineTo(i * s + s - 26, j * s + s / 2);
    ctx.lineTo(i * s + s / 2, j * s + s - 26);
    ctx.lineTo(i * s + 26, j * s + s / 2);
    ctx.closePath();
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
