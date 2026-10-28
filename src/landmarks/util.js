import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export { mergeGeometries };

export function centroid(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

export function stripClosing(pts) {
  const r = pts.slice();
  if (r.length > 2 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  return r;
}

// Minimum-area bounding rectangle: { cx, cz, angle, length, width } where `angle`
// is the direction (radians, in x/z) of the long side.
export function orientedBox(pts) {
  pts = stripClosing(pts);
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    const a = Math.atan2(z1 - z0, x1 - x0);
    const c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of pts) {
      const u = x * c + z * s, v = -x * s + z * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) {
      const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      best = { area, angle: a, cx: uc * c - vc * s, cz: uc * s + vc * c, l: u1 - u0, w: v1 - v0 };
    }
  }
  if (best.w > best.l) { best.angle += Math.PI / 2; [best.l, best.w] = [best.w, best.l]; }
  return { cx: best.cx, cz: best.cz, angle: best.angle, length: best.l, width: best.w };
}

// Rotation about Y so that local +X points along the x/z direction `angle`.
export function yawFromAngle(angle) {
  return -angle;
}

// Extrude a footprint (x/z metres) from y0 up to y1.
export function extrudeFootprint(pts, y0, y1) {
  pts = stripClosing(pts);
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  // Shape lies in XY with depth along +Z → rotate so depth is +Y and shape y = -z.
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  return geo;
}

// A wall (or any ribbon) following a polyline, standing on the terrain.
export function wallAlong(pts, terrain, { height = 10, thickness = 3, sink = 4, step = 4 } = {}) {
  const dense = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    if (i > 0) {
      const [px, pz] = pts[i - 1];
      const len = Math.hypot(x - px, z - pz);
      const k = Math.ceil(len / step);
      for (let s = 1; s < k; s++) dense.push([px + ((x - px) * s) / k, pz + ((z - pz) * s) / k]);
    }
    dense.push([x, z]);
  }
  const pos = [], idx = [];
  const half = thickness / 2;
  for (let i = 0; i < dense.length; i++) {
    const [x, z] = dense[i];
    const [ax, az] = dense[Math.max(0, i - 1)], [bx, bz] = dense[Math.min(dense.length - 1, i + 1)];
    let dx = bx - ax, dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const nx = -dz * half, nz = dx * half;
    const y = terrain.heightAt(x, z);
    // 4 verts per station: left-bottom, left-top, right-top, right-bottom
    pos.push(x + nx, y - sink, z + nz, x + nx, y + height, z + nz, x - nx, y + height, z - nz, x - nx, y - sink, z - nz);
    if (i > 0) {
      const p = (i - 1) * 4, c = i * 4;
      // left face, top, right face
      idx.push(p, c, p + 1, p + 1, c, c + 1);
      idx.push(p + 1, c + 1, p + 2, p + 2, c + 1, c + 2);
      idx.push(p + 2, c + 2, p + 3, p + 3, c + 2, c + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const ni = geo.toNonIndexed();
  ni.computeVertexNormals();
  // UVs: world-scaled planar mapping for the stone texture
  const p = ni.attributes.position, nrm = ni.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const horiz = Math.abs(nrm.getX(i)) > Math.abs(nrm.getZ(i)) ? p.getZ(i) : p.getX(i);
    uv[i * 2] = horiz / 8; uv[i * 2 + 1] = p.getY(i) / 8;
  }
  ni.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return { geometry: ni, stations: dense };
}

// Place items regularly along a polyline (returns [x, z, dirAngle]).
export function sampleAlong(pts, spacing, offset = 0) {
  const out = [];
  let carry = offset;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    let d = carry;
    while (d <= len) {
      out.push([ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len, Math.atan2(bz - az, bx - ax)]);
      d += spacing;
    }
    carry = d - len;
  }
  return out;
}

export function shadowed(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

// Hipped roof over an oriented rectangle (centred at the origin, long side along local X).
export function hipRoofGeometry(length, width, height, overhang = 0.8) {
  const L = length / 2 + overhang, W = width / 2 + overhang;
  const r = Math.max(0, L - W);
  const p = {
    a: [-L, 0, -W], b: [L, 0, -W], c: [L, 0, W], d: [-L, 0, W],
    r0: [-r, height, 0], r1: [r, height, 0],
  };
  const tris = [
    [p.a, p.r1, p.b], [p.a, p.r0, p.r1], // back slope
    [p.d, p.c, p.r1], [p.d, p.r1, p.r0], // front slope
    [p.b, p.r1, p.c], // east hip
    [p.a, p.d, p.r0], // west hip
  ];
  const pos = [];
  for (const t of tris) {
    // orient each face upward
    const [v0, v1, v2] = t;
    const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
    const vx = v2[0] - v0[0], vy = v2[1] - v0[1], vz = v2[2] - v0[2];
    const ny = uz * vx - ux * vz;
    const order = ny >= 0 ? [v0, v1, v2] : [v0, v2, v1];
    for (const v of order) pos.push(...v);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

export function lathe(profile, segments = 32) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}
