import * as THREE from 'three';
import { mulberry } from './groundTexture.js';

const CLS = { residential: 0, commercial: 1, civic: 2, old: 3, monument: 4, light: 5, mosque: 6, glass: 7 };

const PALETTE = {
  [CLS.residential]: ['#ecdfc4', '#dcc6a0', '#ddb092', '#e8d49e', '#efebe3', '#cdc6bb', '#e6bd96', '#dfbcb1', '#e9e1cf', '#d4b98e'],
  [CLS.commercial]: ['#d2cbc0', '#bdb7ae', '#e2d8c8', '#aea9a1', '#c9c2b4'],
  [CLS.civic]: ['#dccfb6', '#cdb593', '#bfa686', '#d8c9ad'],
  [CLS.old]: ['#dcc9a6', '#cda783', '#e6dac4', '#bf9671', '#d9c2a0'],
  [CLS.monument]: ['#ecdfc5'],
  [CLS.light]: ['#b8b0a5', '#a8a39c', '#c2b9ab'],
  [CLS.mosque]: ['#ebe5d9', '#e2dacb'],
  [CLS.glass]: ['#b8c8d4', '#9fb4c4', '#c4cfd6', '#a7b8bf'],
};
const FLAT_ROOF = ['#8f887e', '#a49b8f', '#7f7a74', '#b2a99b'];
const TILE_ROOF = ['#a4533a', '#b4623f', '#8f4a35', '#9c5a3e', '#7a6d66'];

const BAY = 3.2 * 4; // facade texture tile width in metres
const STOREY = 3.1 * 4; // facade texture tile height in metres
const CHUNK = 2200;

class GeoBuilder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  vert(x, y, z, nx, ny, nz, u, v, c) {
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.uv.push(u, v); this.col.push(c.r, c.g, c.b);
    return this.n++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  build() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

function pick(list, seed) { return new THREE.Color(list[seed % list.length]); }

// Returns { group, mosques: [{x,z,top,r}], roofs: [...] } — meshes chunked for culling.
export function buildCity(items, materials) {
  const chunks = new Map();
  const getChunk = (x, z) => {
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    if (!chunks.has(k)) chunks.set(k, { facade: new GeoBuilder(), glass: new GeoBuilder(), plain: new GeoBuilder(), colonnade: new GeoBuilder(), roof: new GeoBuilder() });
    return chunks.get(k);
  };
  const mosques = [];
  const rooftop = [];
  const rnd = mulberry(99);
  const tmpV2 = [];

  for (const b of items) {
    const base = b[0] / 10, h = b[1] / 10, cls = b[2], roofType = b[3], seed = b[4];
    const ring = [];
    for (let i = 5; i < b.length; i += 2) ring.push([b[i] / 10, b[i + 1] / 10]);
    const n = ring.length;
    let cx = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cz += p[1]; }
    cx /= n; cz /= n;
    const ch = getChunk(cx, cz);
    const wallKind = cls === CLS.glass ? 'glass' : cls === CLS.monument ? 'colonnade' : (cls === CLS.mosque || cls === CLS.light) ? 'plain' : 'facade';
    const wb = ch[wallKind];
    const color = pick(PALETTE[cls], seed);
    // gentle per-building brightness jitter
    color.multiplyScalar(0.92 + (seed % 17) / 17 * 0.14);
    const bottom = base - 2, top = base + h;
    const u0 = (seed % 8) * 0.25, v0 = ((seed >> 3) % 4) * 0.25;

    // Walls
    let perim = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n];
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const nx = -dz / len, nz = dx / len;
      const ua = u0 + perim / BAY, ub = u0 + (perim + len) / BAY;
      // Snap texture width so windows don't get cut at corners
      const ubs = ua + Math.max(0.25, Math.round((ub - ua) * 4) / 4);
      perim += len;
      const vb = v0 + (bottom - base) / STOREY, vt = v0 + h / STOREY;
      const a = wb.vert(x0, bottom, z0, nx, 0, nz, ua, vb, color);
      const bb = wb.vert(x1, bottom, z1, nx, 0, nz, ubs, vb, color);
      const c = wb.vert(x1, top, z1, nx, 0, nz, ubs, vt, color);
      const d = wb.vert(x0, top, z0, nx, 0, nz, ua, vt, color);
      wb.tri(a, bb, c); wb.tri(a, c, d);
    }

    // Roof
    const rb = ch.roof;
    if (roofType === 1) {
      const rc = pick(TILE_ROOF, seed >> 2);
      let area = 0;
      for (let i = 0; i < n; i++) area += ring[i][0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * ring[i][1];
      area = Math.abs(area / 2);
      const rh = Math.min(5.5, Math.max(1.5, Math.sqrt(area) * 0.22));
      // Hipped roof approximated by a pyramid over the (convex) footprint with a small overhang.
      const apex = [cx, top + rh, cz];
      for (let i = 0; i < n; i++) {
        const p0 = ring[i], p1 = ring[(i + 1) % n];
        const e0 = [cx + (p0[0] - cx) * 1.06, top - 0.25, cz + (p0[1] - cz) * 1.06];
        const e1 = [cx + (p1[0] - cx) * 1.06, top - 0.25, cz + (p1[1] - cz) * 1.06];
        const ux = e1[0] - e0[0], uy = e1[1] - e0[1], uz = e1[2] - e0[2];
        const vx = apex[0] - e0[0], vy = apex[1] - e0[1], vz = apex[2] - e0[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        const flip = ny < 0 ? -1 : 1;
        nx *= flip / l; ny *= flip / l; nz *= flip / l;
        const a = rb.vert(...e0, nx, ny, nz, 0, 0, rc);
        const bb = rb.vert(...e1, nx, ny, nz, 1, 0, rc);
        const c = rb.vert(...apex, nx, ny, nz, 0.5, 1, rc);
        if (flip > 0) rb.tri(a, bb, c); else rb.tri(a, c, bb);
      }
    } else {
      const rc = cls === CLS.monument ? new THREE.Color('#e3d6bc') : cls === CLS.glass ? new THREE.Color('#6f7880') : pick(FLAT_ROOF, seed >> 1);
      tmpV2.length = 0;
      for (const [x, z] of ring) tmpV2.push(new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(tmpV2, []);
      const start = rb.n;
      for (const [x, z] of ring) rb.vert(x, top, z, 0, 1, 0, x / 20, z / 20, rc);
      for (const [i0, i1, i2] of tris) {
        // keep upward winding
        const [ax, az] = ring[i0], [bx, bz] = ring[i1], [cx2, cz2] = ring[i2];
        const cross = (bx - ax) * (cz2 - az) - (bz - az) * (cx2 - ax);
        if (cross < 0) rb.tri(start + i0, start + i1, start + i2); else rb.tri(start + i0, start + i2, start + i1);
      }
      // Rooftop clutter: water heaters / solar panels, the classic Turkish roofscape.
      if ((cls === CLS.residential || cls === CLS.commercial) && h < 60 && n <= 12 && rnd() < 0.55) {
        const k = 1 + Math.floor(rnd() * 3);
        for (let j = 0; j < k; j++) {
          const p = ring[Math.floor(rnd() * n)];
          const t = 0.25 + rnd() * 0.4;
          rooftop.push([cx + (p[0] - cx) * t, top, cz + (p[1] - cz) * t, rnd() * Math.PI]);
        }
      }
    }

    if (cls === CLS.mosque) {
      let area = 0;
      for (let i = 0; i < n; i++) area += ring[i][0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * ring[i][1];
      area = Math.abs(area / 2);
      // Minaret at the footprint corner farthest from the qibla (roughly NW).
      let best = ring[0], bestScore = -Infinity;
      for (const p of ring) { const s = -(p[0] - cx) * 0.4 - (p[1] - cz); if (s > bestScore) { bestScore = s; best = p; } }
      mosques.push({ x: cx, z: cz, top, r: Math.min(14, Math.max(3, Math.sqrt(area) * 0.3)), mx: best[0], mz: best[1], base, h });
    }
  }

  const group = new THREE.Group();
  group.name = 'city';
  for (const ch of chunks.values()) {
    for (const [kind, gb] of Object.entries(ch)) {
      const geo = gb.build();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, materials[kind]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  group.add(buildMosqueDetails(mosques, materials));
  group.add(buildRooftops(rooftop, materials));
  return group;
}

function buildMosqueDetails(mosques, materials) {
  const g = new THREE.Group();
  if (!mosques.length) return g;
  const dome = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const domes = new THREE.InstancedMesh(dome, materials.lead, mosques.length);
  // Minaret: shaft, balcony, conical cap (unit height 1, radius 1)
  const prof = [
    [0, 0], [1.3, 0], [1.3, 0.05], [1, 0.07], [1, 0.72], [1.6, 0.74], [1.6, 0.76], [1, 0.77], [0.9, 0.86], [0.9, 0.88], [0.001, 1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const minaretGeo = new THREE.LatheGeometry(prof, 8);
  const minarets = new THREE.InstancedMesh(minaretGeo, materials.whiteStone, mosques.length);
  const m = new THREE.Matrix4();
  mosques.forEach((q, i) => {
    m.makeScale(q.r, q.r * 0.85, q.r).setPosition(q.x, q.top - 0.3, q.z);
    domes.setMatrixAt(i, m);
    const mh = Math.min(48, Math.max(18, q.h * 2.4 + 8));
    m.makeScale(1.25, mh, 1.25).setPosition(q.mx, q.base, q.mz);
    minarets.setMatrixAt(i, m);
  });
  for (const im of [domes, minarets]) { im.castShadow = true; im.receiveShadow = true; g.add(im); }
  return g;
}

function buildRooftops(items, materials) {
  const geo = new THREE.BoxGeometry(1.6, 1.3, 1.1);
  geo.translate(0, 0.65, 0);
  const mesh = new THREE.InstancedMesh(geo, materials.steel, items.length);
  const panelGeo = new THREE.BoxGeometry(2.2, 0.08, 1.6);
  panelGeo.rotateX(-0.6);
  panelGeo.translate(0, 0.9, 1.2);
  const panels = new THREE.InstancedMesh(panelGeo, new THREE.MeshStandardMaterial({ color: '#2a3a52', roughness: 0.2, metalness: 0.6 }), items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  items.forEach(([x, y, z, rot], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    m.compose(p.set(x, y, z), q, s);
    mesh.setMatrixAt(i, m);
    panels.setMatrixAt(i, m);
  });
  const g = new THREE.Group();
  mesh.castShadow = panels.castShadow = true;
  g.add(mesh, panels);
  return g;
}
