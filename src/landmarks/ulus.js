import * as THREE from 'three';
import { orientedBox, extrudeFootprint, shadowed, hipRoofGeometry, mergeGeometries } from './util.js';

// Ulus: the Victory Monument (Zafer Anıtı) and the First & Second Grand National
// Assembly buildings — the heart of early-Republican Ankara.
export function buildUlus({ terrain, lm, mat }) {
  const group = new THREE.Group();
  group.name = 'Ulus';
  const [sx, sz] = lm.zaferAniti;
  const sy = terrain.heightAt(sx, sz);

  // Square paving around the monument
  const square = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 1.2, 48).translate(sx, sy - 0.3, sz), mat.paving);
  square.receiveShadow = true;
  group.add(square);

  // Monument: stepped plinth, andesite pedestal with bronze soldiers, equestrian statue
  const mon = new THREE.Group();
  mon.position.set(sx, sy, sz);
  mon.rotation.y = -0.6;
  const stone = mat.andesite;
  mon.add(new THREE.Mesh(new THREE.BoxGeometry(11, 0.8, 11).translate(0, 0.4, 0), mat.whiteStone));
  mon.add(new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.2, 8.6).translate(0, 1.4, 0), stone));
  mon.add(new THREE.Mesh(new THREE.BoxGeometry(5.2, 6.5, 4.2).translate(0, 5.25, 0), stone));
  mon.add(new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.6, 4.8).translate(0, 8.8, 0), stone));
  const bronze = mat.bronze;
  // soldier figures at the base (two standing, one kneeling) — simplified
  const fig = (x, z, h) => {
    const parts = [
      new THREE.CylinderGeometry(0.35, 0.45, h * 0.55, 8).translate(x, 2 + h * 0.275, z),
      new THREE.CylinderGeometry(0.3, 0.35, h * 0.35, 8).translate(x, 2 + h * 0.72, z),
      new THREE.SphereGeometry(0.28, 10, 8).translate(x, 2 + h * 0.97, z),
    ];
    mon.add(new THREE.Mesh(mergeGeometries(parts.map((p) => p.toNonIndexed())), bronze));
  };
  fig(-2.0, 3.1, 2.6); fig(2.0, 3.1, 2.6); fig(0, -3.1, 2.3); fig(0, 3.3, 2.0);
  // Horse
  const horse = new THREE.Group();
  horse.position.y = 9.1;
  const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 12);
  horse.add(new THREE.Mesh(capsule(0.85, 2.2).rotateZ(Math.PI / 2).translate(0, 2.6, 0), bronze));
  horse.add(new THREE.Mesh(capsule(0.45, 1.3).rotateZ(-0.7).translate(1.75, 3.6, 0), bronze)); // neck
  horse.add(new THREE.Mesh(capsule(0.32, 0.9).rotateZ(-1.9).translate(2.45, 4.1, 0), bronze)); // head
  horse.add(new THREE.Mesh(capsule(0.18, 0.9).rotateZ(-2.6).translate(-1.95, 2.3, 0), bronze)); // tail
  for (const [lx, lz] of [[1.2, 0.45], [1.2, -0.45], [-1.2, 0.45], [-1.2, -0.45]]) {
    horse.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 2.1, 8).translate(lx, 1.05, lz), bronze));
  }
  // Rider in greatcoat
  horse.add(new THREE.Mesh(capsule(0.42, 1.1).translate(0.15, 4.25, 0), bronze));
  horse.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10).translate(0.2, 5.35, 0), bronze));
  horse.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.2, 6).translate(0.15, 3.35, 0.45), bronze));
  horse.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.2, 6).translate(0.15, 3.35, -0.45), bronze));
  mon.add(horse);
  group.add(mon);

  // Assembly buildings (First National Architecture style): stone, arched windows, tiled hipped roofs
  const assembly = (pts, { height, color, roofH }) => {
    const ys = pts.map((p) => terrain.heightAt(...p));
    const base = Math.min(...ys) - 1, top = Math.max(...ys) + height;
    const geo = extrudeFootprint(pts, base, top);
    // planar UVs so the arched-window texture repeats per 7 m bay and 5 m storey
    const p = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const h = Math.abs(nrm.getX(i)) > Math.abs(nrm.getZ(i)) ? p.getZ(i) : p.getX(i);
      uv.setXY(i, h / 14, (p.getY(i) - base - 0.8) / 10);
    }
    const m = mat.arched.clone();
    m.vertexColors = false;
    m.color.set(color);
    const mesh = new THREE.Mesh(geo, m);
    group.add(mesh);
    const b = orientedBox(pts);
    const roof = new THREE.Mesh(hipRoofGeometry(b.length, b.width, roofH, 0.9), mat.tile);
    roof.position.set(b.cx, top, b.cz);
    roof.rotation.y = -b.angle;
    group.add(roof);
    return { b, top };
  };
  const first = assembly(lm.firstAssembly.pts, { height: 10, color: '#d4a48e', roofH: 5 });
  const second = assembly(lm.secondAssembly.pts, { height: 12, color: '#efe5d0', roofH: 5.5 });

  shadowed(group);
  return {
    group,
    anchor: new THREE.Vector3(sx, sy + 24, sz),
    focus: new THREE.Vector3((sx + first.b.cx) / 2, sy + 6, (sz + first.b.cz) / 2),
    facing: 0,
    extra: { first, second },
  };
}
