import * as THREE from 'three';

// Classes from process-osm: 0 motorway/trunk, 1 primary, 2 secondary, 3 tertiary/links,
// 4 residential, 5 service, 6 pedestrian, 7 footway, 8 rail
const COLORS = ['#58585c', '#5a5a5e', '#5d5d61', '#626265', '#68686a', '#8a8782', '#cfc4ad', '#c9bea6', '#4e4741'];
const STEP = 6; // densify spacing in metres so ribbons follow the terrain

export function buildRoads(items, terrain, materials) {
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  let n = 0;
  const c = new THREE.Color();
  for (const r of items) {
    const cls = r[0];
    if (cls === 7) continue; // footpaths only live in the ground texture
    const width = r[1] / 10, half = width / 2;
    const pts = [];
    for (let i = 2; i < r.length; i += 2) {
      const x = r[i] / 10, z = r[i + 1] / 10;
      if (pts.length) {
        const [px, pz] = pts[pts.length - 1];
        const len = Math.hypot(x - px, z - pz);
        const k = Math.floor(len / STEP);
        for (let s = 1; s < k; s++) pts.push([px + ((x - px) * s) / k, pz + ((z - pz) * s) / k]);
      }
      pts.push([x, z]);
    }
    if (pts.length < 2) continue;
    c.set(COLORS[cls]);
    // Major roads use the full marked texture width, small streets only its plain centre strip.
    const [ua, ub] = cls <= 2 ? [0, 1] : [0.12, 0.38];
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const [x0, z0] = pts[Math.max(0, i - 1)], [x1, z1] = pts[Math.min(pts.length - 1, i + 1)];
      let dx = x1 - x0, dz = z1 - z0;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      if (i > 0) dist += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      const nx = -dz * half, nz = dx * half;
      const lift = cls === 8 ? 0.25 : 0.35 + (6 - Math.min(cls, 6)) * 0.03;
      const v = dist / 12;
      for (const [sx, u] of [[1, ua], [-1, ub]]) {
        const px = x + nx * sx, pz = z + nz * sx;
        pos.push(px, terrain.heightAt(px, pz) + lift, pz);
        nrm.push(0, 1, 0);
        uv.push(u, v);
        col.push(c.r, c.g, c.b);
      }
      if (i > 0) {
        const a = n - 2, b = n - 1, cc = n, d = n + 1;
        idx.push(a, cc, b, b, cc, d);
      }
      n += 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, materials.road);
  mesh.receiveShadow = true;
  mesh.name = 'roads';
  return mesh;
}
