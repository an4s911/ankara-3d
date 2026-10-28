import * as THREE from 'three';
import { centroid, extrudeFootprint, wallAlong, sampleAlong, shadowed, mergeGeometries, stripClosing } from './util.js';

// Ankara Kalesi: Byzantine-era inner citadel and outer walls with pentagonal towers,
// crowned by Akkale (the White Tower) and its Turkish flag.
export function buildKale({ terrain, lm, mat }) {
  const group = new THREE.Group();
  group.name = 'Ankara Kalesi';
  const wallMat = mat.andesite;
  const geos = [], merlons = [], towers = [];

  const addWall = (pts, opts) => {
    const { geometry, stations } = wallAlong(pts, terrain, opts);
    geos.push(geometry);
    // crenellations
    for (const [x, z, a] of sampleAlong(stations, 3.2, 1)) {
      const g = new THREE.BoxGeometry(1.6, 1.8, opts.thickness + 0.2);
      g.rotateY(-a);
      g.translate(x, terrain.heightAt(x, z) + opts.height + 0.9, z);
      merlons.push(g.toNonIndexed());
    }
    // towers
    for (const [x, z, a] of sampleAlong(stations, opts.towerSpacing, opts.towerSpacing / 2)) {
      const h = opts.height + 4;
      const r = opts.towerR;
      const y = terrain.heightAt(x, z);
      const g = new THREE.CylinderGeometry(r, r * 1.08, h + 6, opts.pentagon ? 5 : 4);
      g.rotateY(-a + (opts.pentagon ? Math.PI / 10 : Math.PI / 4));
      g.translate(x, y - 6 + (h + 6) / 2, z);
      towers.push(g.toNonIndexed());
      for (let k = 0; k < (opts.pentagon ? 5 : 4); k++) {
        const ang = -a + (k / (opts.pentagon ? 5 : 4)) * Math.PI * 2;
        const mg = new THREE.BoxGeometry(1.5, 1.6, 1.5).translate(x + Math.cos(ang) * r * 0.8, y + h + 0.8, z + Math.sin(ang) * r * 0.8);
        merlons.push(mg.toNonIndexed());
      }
    }
  };

  const inner = { height: 13, thickness: 4, towerSpacing: 30, towerR: 5.6, pentagon: true };
  const outer = { height: 9, thickness: 3, towerSpacing: 42, towerR: 4.6, pentagon: false };
  for (const k of ['kaleWallInner1', 'kaleWallInner2', 'kaleWallInner3']) if (lm[k]) addWall(lm[k].pts, inner);
  for (const k of ['kaleWallOuter', 'kaleWallOuter2', 'kaleWallOuter3', 'kaleWallLower']) if (lm[k]) addWall(lm[k].pts, outer);

  group.add(new THREE.Mesh(mergeGeometries(geos), wallMat));
  group.add(new THREE.Mesh(mergeGeometries(towers), wallMat));
  group.add(new THREE.Mesh(mergeGeometries(merlons), wallMat));

  // Akkale keep
  const ak = stripClosing(lm.akkale.pts);
  const akH = ak.map((p) => terrain.heightAt(...p));
  const akBase = Math.min(...akH) - 4, akTop = Math.max(...akH) + 11;
  const akGeo = extrudeFootprint(ak, akBase, akTop);
  // world-planar UVs for the stone texture
  const p = akGeo.attributes.position, uv = akGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 8, p.getY(i) / 8);
  group.add(new THREE.Mesh(akGeo, wallMat));
  const akMerl = [];
  for (const [x, z, a] of sampleAlong([...ak, ak[0]], 3, 1)) {
    const g = new THREE.BoxGeometry(1.5, 1.8, 1.5);
    g.rotateY(-a);
    g.translate(x, akTop + 0.9, z);
    akMerl.push(g.toNonIndexed());
  }
  group.add(new THREE.Mesh(mergeGeometries(akMerl), wallMat));

  // The giant Turkish flag flying over the citadel
  const [fx, fz] = centroid(ak);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 18, 8).translate(fx, akTop + 9, fz), mat.steel);
  group.add(pole);
  const flagGeo = new THREE.PlaneGeometry(9, 6, 24, 8);
  flagGeo.translate(4.5, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: turkishFlag(), side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(fx + 0.2, akTop + 15, fz);
  flag.rotation.y = -0.35; // stream with the westerly breeze
  group.add(flag);
  const base = flagGeo.attributes.position.array.slice();

  shadowed(group);
  return {
    group,
    anchor: new THREE.Vector3(fx, akTop + 26, fz),
    focus: new THREE.Vector3(900, akTop - 10, -2200),
    facing: 0,
    update(time) {
      const pos = flagGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], yy = base[i * 3 + 1];
        const w = x / 9;
        pos.setZ(i, Math.sin(x * 0.9 - time * 4.2) * 0.55 * w + Math.sin(yy * 0.8 + time * 2.3) * 0.15 * w);
        pos.setY(i, yy - w * w * 0.4);
      }
      pos.needsUpdate = true;
      flagGeo.computeVertexNormals();
    },
  };
}

function turkishFlag() {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e30a17';
  ctx.fillRect(0, 0, 300, 200);
  // crescent: white circle with an offset red circle (official proportions, G = 200)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(100, 100, 50, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e30a17';
  ctx.beginPath(); ctx.arc(112.5, 100, 40, 0, Math.PI * 2); ctx.fill();
  // star
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const sx = 170.8, sy = 100, R = 25, r = R * 0.382;
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
  }
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
