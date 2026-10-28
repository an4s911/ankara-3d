import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from './groundTexture.js';

function colored(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}

function deciduousGeo() {
  const trunk = colored(new THREE.CylinderGeometry(0.18, 0.28, 3, 4, 1, true).translate(0, 1.5, 0), '#5a4634');
  const crown = new THREE.IcosahedronGeometry(2.6, 0);
  crown.scale(1, 0.85, 1).translate(0, 4.6, 0);
  // lumpy crown
  const p = crown.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = 0.86 + 0.28 * Math.abs(Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3 + p.getY(i)));
    p.setXYZ(i, p.getX(i) * s, 4.6 + (p.getY(i) - 4.6) * s, p.getZ(i) * s);
  }
  crown.computeVertexNormals();
  return mergeGeometries([trunk, colored(crown, '#ffffff')]);
}

function coniferGeo() {
  const trunk = colored(new THREE.CylinderGeometry(0.15, 0.25, 2.4, 4, 1, true).translate(0, 1.2, 0), '#4d3b2c');
  const c1 = colored(new THREE.ConeGeometry(2.1, 4.6, 6).translate(0, 3.8, 0), '#ffffff');
  const c2 = colored(new THREE.ConeGeometry(1.4, 3.8, 6).translate(0, 6.4, 0), '#ffffff');
  return mergeGeometries([trunk, c1, c2]);
}

export function buildTrees(items, terrain) {
  const kinds = [[], []];
  for (let i = 0; i < items.length; i += 3) kinds[items[i + 2]].push([items[i] / 10, items[i + 1] / 10]);
  const rnd = mulberry(42);
  // White vertex colour on the crown lets the per-instance colour tint only the foliage.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  mat.onBeforeCompile = (shader) => {
    // Keep trunks brown: instance colour only affects bright (crown) vertices.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      `#include <color_vertex>
       #ifdef USE_INSTANCING_COLOR
         vColor.xyz = color.r > 0.9 ? instanceColor.xyz : color.xyz;
       #endif`,
    );
  };
  const group = new THREE.Group();
  group.name = 'trees';
  const deciduous = ['#5f7136', '#6a7a3a', '#55682f', '#7a8040', '#9a8a3a', '#b0823a', '#6d7a45'];
  const conifer = ['#3e5631', '#36502e', '#46603a', '#3b4f35'];
  [deciduousGeo(), coniferGeo()].forEach((geo, k) => {
    const list = kinds[k];
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    const pal = k === 0 ? deciduous : conifer;
    list.forEach(([x, z], i) => {
      const sc = 0.75 + rnd() * 0.7;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
      m.compose(p.set(x, terrain.heightAt(x, z) - 0.2, z), q, s.set(sc, sc * (0.85 + rnd() * 0.35), sc));
      mesh.setMatrixAt(i, m);
      // A touch of October colour in the deciduous trees.
      c.set(pal[Math.floor(rnd() * (k === 0 && rnd() < 0.75 ? 4 : pal.length))]);
      c.multiplyScalar(0.85 + rnd() * 0.3);
      mesh.setColorAt(i, c);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  return group;
}

// Low-detail blocks across the outer terrain: the sprawl that surrounds downtown.
// Laid out on a jittered street grid so it reads as city blocks rather than noise.
export function buildSprawl(terrain) {
  const inner = terrain.inner;
  const rnd = mulberry(77);
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const max = 60000;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  const pal = ['#cdbfa6', '#c4ad8c', '#c9a58c', '#bdb5a8', '#d3cbbd', '#b9a68c', '#b48a72'];
  const BLOCK = 46;
  let count = 0;
  for (let gx = -15000; gx < 15000 && count < max; gx += BLOCK) {
    for (let gz = -15000; gz < 15000 && count < max; gz += BLOCK) {
      const x = gx + (rnd() - 0.5) * 14, z = gz + (rnd() - 0.5) * 14;
      if (x > inner.minX - 30 && x < inner.maxX + 30 && z > inner.minZ - 30 && z < inner.maxZ + 30) continue;
      // distance outside the detailed rectangle
      const dx = Math.max(inner.minX - x, 0, x - inner.maxX), dz = Math.max(inner.minZ - z, 0, z - inner.maxZ);
      const out = Math.hypot(dx, dz);
      const r = Math.hypot(x, z);
      const neighbourhood = 0.55 + 0.45 * Math.sin(x * 0.0009 + 1.3) * Math.cos(z * 0.0011 - 0.4);
      const density = Math.max(0, Math.min(1, (14000 - r) / 6000)) * (out < 600 ? 0.95 : neighbourhood);
      if (rnd() > density) continue;
      const y = terrain.heightAt(x, z);
      const slope = Math.abs(terrain.heightAt(x + 20, z) - y) + Math.abs(terrain.heightAt(x, z + 20) - y);
      if (slope > 16) continue;
      const w = 16 + rnd() * 16, d = 12 + rnd() * 14;
      const tall = rnd() < 0.04;
      const h = tall ? 35 + rnd() * 45 : 9 + rnd() * 15;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 0.15);
      m.compose(p.set(x, y - 2, z), q, s.set(w, h + 2, d));
      mesh.setMatrixAt(count, m);
      c.set(pal[Math.floor(rnd() * pal.length)]).multiplyScalar(0.8 + rnd() * 0.15);
      mesh.setColorAt(count, c);
      count++;
    }
  }
  mesh.count = count;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  mesh.name = 'sprawl';
  return mesh;
}
