import * as THREE from 'three';
import { centroid, orientedBox, extrudeFootprint, shadowed, hipRoofGeometry, stripClosing } from './util.js';

// Gençlik Parkı: the Republic-era park with its lake, long pool & fountains,
// the amusement park's Ferris wheel and the Ankara Opera House at its edge.
export function buildGenclikParki({ terrain, lm, mat }) {
  const group = new THREE.Group();
  group.name = 'Gençlik Parkı';
  const updaters = [];

  // Water surfaces (the lake and the long ornamental pool), with a stone kerb
  for (const key of ['genclikLake', 'genclikPool']) {
    const pts = stripClosing(lm[key].pts);
    const c = centroid(pts);
    const level = Math.max(terrain.heightAt(...c) + 0.35, percentile(pts.map((p) => terrain.heightAt(...p)), 0.3));
    const water = new THREE.Mesh(extrudeFootprint(pts, level - 4, level), mat.water);
    water.receiveShadow = true;
    group.add(water);
    const kerbShape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const kerb = new THREE.Mesh(new THREE.ExtrudeGeometry(kerbShape, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 1.2, bevelSegments: 1 }).rotateX(-Math.PI / 2).translate(0, level - 0.45, 0), mat.paving);
    group.add(kerb);
    if (key === 'genclikPool') {
      // A line of fountain jets along the pool's axis
      const box = orientedBox(pts);
      const jetMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.2, emissive: '#fff2dd', emissiveIntensity: 0.25, depthWrite: false });
      const jets = [];
      for (let i = 0; i < 9; i++) {
        const t = (i / 8 - 0.5) * box.length * 0.8;
        const big = i === 4;
        const jet = new THREE.Mesh(new THREE.ConeGeometry(big ? 1.4 : 0.8, 1, 10, 1, true).translate(0, 0.5, 0), jetMat);
        jet.position.set(box.cx + Math.cos(box.angle) * t, level, box.cz + Math.sin(box.angle) * t);
        jet.userData.h = big ? 16 : 7 + (i % 2) * 3;
        jet.userData.phase = i * 0.7;
        group.add(jet);
        jets.push(jet);
      }
      updaters.push((time) => {
        for (const j of jets) j.scale.set(1, j.userData.h * (0.85 + 0.15 * Math.sin(time * 1.7 + j.userData.phase)), 1);
      });
    }
  }

  // Ferris wheel in the amusement park
  const lp = centroid(lm.lunapark.pts);
  const wx = lp[0] - 30, wz = lp[1] + 10;
  const wy = terrain.heightAt(wx, wz);
  const wheel = ferrisWheel(mat);
  wheel.group.position.set(wx, wy, wz);
  wheel.group.rotation.y = 0.55;
  group.add(wheel.group);
  updaters.push(wheel.update);

  // Ankara Opera House (1948, converted from the 1933 Exhibition Hall)
  const ob = orientedBox(lm.opera.pts);
  const opera = new THREE.Group();
  const oy = terrain.heightAt(ob.cx, ob.cz) - 1;
  opera.position.set(ob.cx, oy, ob.cz);
  opera.rotation.y = -ob.angle;
  const L = Math.min(ob.length * 0.55, 100), W = Math.min(ob.width * 0.5, 50);
  const operaStone = new THREE.MeshStandardMaterial({ color: '#e2cfa8', roughness: 0.75 });
  opera.add(new THREE.Mesh(new THREE.BoxGeometry(L, 15, W).translate(0, 7.5, 0), operaStone));
  // Stage fly tower
  opera.add(new THREE.Mesh(new THREE.BoxGeometry(L * 0.28, 27, W * 0.8).translate(L * 0.3, 13.5, 0), operaStone));
  opera.add(new THREE.Mesh(hipRoofGeometry(L * 0.28, W * 0.8, 3, 0.5).translate(L * 0.3, 27, 0), mat.tile));
  // Entrance portico with columns
  for (let i = 0; i < 6; i++) {
    opera.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 10, 12).translate(-L / 2 - 4, 6, (i - 2.5) * 3.4), mat.whiteStone));
  }
  opera.add(new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 20).translate(-L / 2 - 3.5, 11.8, 0), operaStone));
  opera.add(new THREE.Mesh(hipRoofGeometry(L, W, 4, 0.8).translate(0, 15, 0), mat.tile));
  group.add(opera);

  shadowed(group);
  return {
    group,
    anchor: new THREE.Vector3(wx, wy + 60, wz),
    focus: new THREE.Vector3(-380, wy + 10, -1760),
    facing: 0,
    update(time) { for (const u of updaters) u(time); },
  };
}

function percentile(arr, q) {
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * q)];
}

function ferrisWheel(mat) {
  const group = new THREE.Group();
  const R = 20, hubY = R + 4;
  const steel = new THREE.MeshStandardMaterial({ color: '#f1efe9', metalness: 0.5, roughness: 0.35 });
  // A-frame legs on both sides
  for (const s of [-1, 1]) {
    for (const lx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, Math.hypot(hubY, 9), 8), steel);
      leg.position.set(lx * 4.5, hubY / 2, s * 3);
      leg.rotation.z = lx * Math.atan2(9, hubY);
      group.add(leg);
    }
  }
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 7, 12).rotateX(Math.PI / 2).translate(0, hubY, 0), steel));
  const wheel = new THREE.Group();
  wheel.position.y = hubY;
  for (const s of [-1.6, 1.6]) {
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.3, 6, 64).translate(0, 0, s), steel));
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.15, 6, 48).translate(0, 0, s), steel));
  }
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    for (const s of [-1.6, 1.6]) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, R, 4).translate(0, R / 2, s), steel);
      spoke.rotation.z = a;
      wheel.add(spoke);
    }
  }
  group.add(wheel);
  const colors = ['#d8473a', '#e6a52f', '#3a7bc8', '#47a35a', '#e0e0e0', '#c84a8a'];
  const cabins = [];
  for (let i = 0; i < N; i++) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 2.2).translate(0, -1.6, 0),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.5 }));
    group.add(cab);
    cabins.push(cab);
  }
  const place = (rot) => {
    wheel.rotation.z = rot;
    cabins.forEach((c, i) => {
      const a = rot + (i / N) * Math.PI * 2 + Math.PI / 2;
      c.position.set(Math.cos(a) * R, hubY + Math.sin(a) * R, 0);
    });
  };
  place(0);
  return { group, update: (time) => place(time * 0.05) };
}
