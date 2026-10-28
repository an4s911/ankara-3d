import * as THREE from 'three';
import { centroid, orientedBox, extrudeFootprint, shadowed, lathe, mergeGeometries } from './util.js';

// Kocatepe Mosque: neo-classical Ottoman mosque with a 25.5 m central dome,
// four semi-domes and four 88 m minarets, plus its arcaded courtyard.
export function buildKocatepe({ terrain, lm, mat }) {
  const group = new THREE.Group();
  group.name = 'Kocatepe Camii';
  const outer = lm.kocatepeOuter.pts, inner = lm.kocatepeInner.pts;
  const oc = centroid(outer), ic = centroid(inner);
  const box = orientedBox(outer);
  // Qibla axis: from the courtyard through the prayer hall (towards Mecca, SSE).
  const qv = new THREE.Vector2(oc[0] - ic[0], oc[1] - ic[1]).normalize();
  const ax = new THREE.Vector2(Math.cos(box.angle), Math.sin(box.angle));
  const ay = new THREE.Vector2(-ax.y, ax.x);
  let fwd = Math.abs(qv.dot(ax)) > Math.abs(qv.dot(ay)) ? ax : ay;
  if (fwd.dot(qv) < 0) fwd = fwd.clone().multiplyScalar(-1);
  const side = new THREE.Vector2(fwd.y, -fwd.x);
  const proj = (pts, v) => pts.map(([x, z]) => x * v.x + z * v.y);
  const oF = proj(outer, fwd), iF = proj(inner, fwd), oS = proj(outer, side), iS = proj(inner, side);
  const a0 = Math.min(...oF), a1 = Math.max(...oF), c1 = Math.max(...iF);
  const s0 = Math.min(...oS), s1 = Math.max(...oS);
  const ci0 = Math.min(...iF), ci1 = c1, cs0 = Math.min(...iS), cs1 = Math.max(...iS);

  const heights = outer.map((p) => terrain.heightAt(...p));
  const yG = Math.max(...heights) + 0.5;

  // Platform (the mosque stands on a terrace over its car park)
  group.add(new THREE.Mesh(extrudeFootprint(outer, Math.min(...heights) - 4, yG), mat.whiteStone));

  // Local frame: origin at the hall centre, +Z = qibla, +X = side
  const hallStart = c1 + 7;
  const hallLen = a1 - hallStart, hallW = s1 - s0;
  const S = Math.min(hallLen, hallW);
  const hallCF = (hallStart + a1) / 2, hallCS = (s0 + s1) / 2;
  const toWorld = (f, s) => [fwd.x * f + side.x * s, fwd.y * f + side.y * s];
  const local = new THREE.Group();
  const [hx, hz] = toWorld(hallCF, hallCS);
  local.position.set(hx, yG, hz);
  // local +Z → fwd, local +X → side
  local.rotation.y = Math.atan2(fwd.x, fwd.y);
  group.add(local);
  const add = (geo, m = mat.whiteStone, parent = local) => { const mesh = new THREE.Mesh(geo, m); parent.add(mesh); return mesh; };

  const hallH = 19;
  add(new THREE.BoxGeometry(hallW, hallH, hallLen).translate(0, hallH / 2, 0));
  // window rows
  const winMat = new THREE.MeshStandardMaterial({ color: '#2f3640', roughness: 0.3, metalness: 0.4 });
  const wins = [];
  for (const level of [5, 10.5, 15]) {
    for (let i = -3; i <= 3; i++) {
      for (const sgn of [-1, 1]) {
        wins.push(new THREE.BoxGeometry(1.6, level === 15 ? 2.2 : 3, 0.3).translate(i * (hallW / 8), level, sgn * (hallLen / 2 + 0.05)));
        wins.push(new THREE.BoxGeometry(0.3, level === 15 ? 2.2 : 3, 1.6).translate(sgn * (hallW / 2 + 0.05), level, i * (hallLen / 8)));
      }
    }
  }
  add(mergeGeometries(wins), winMat);
  // cornice
  add(new THREE.BoxGeometry(hallW + 1.2, 0.8, hallLen + 1.2).translate(0, hallH + 0.4, 0));

  const R = 12.75; // main dome radius
  const yD = hallH + 6;
  // square base under the dome, pendentive level & drum
  add(new THREE.BoxGeometry(2 * R + 4, 6, 2 * R + 4).translate(0, hallH + 3, 0));
  add(new THREE.CylinderGeometry(R + 0.6, R + 1.0, 4.2, 40).translate(0, yD + 2.1, 0));
  // drum windows
  const drumWins = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    drumWins.push(new THREE.BoxGeometry(1.2, 2.4, 0.4).translate(0, yD + 2.1, R + 0.9).rotateY(a));
  }
  add(mergeGeometries(drumWins), winMat);
  // Main dome
  add(new THREE.SphereGeometry(R + 0.4, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, yD + 4, 0), mat.lead);
  // Finial (alem)
  add(lathe([[0.001, 0], [0.5, 0], [0.35, 1.2], [0.7, 1.8], [0.3, 2.6], [0.6, 3.1], [0.001, 4.2]], 12).translate(0, yD + 4 + R + 0.2, 0), new THREE.MeshStandardMaterial({ color: '#c79b3c', metalness: 0.9, roughness: 0.3 }));

  // Four semi-domes, opening out from the central dome
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2;
    const g = new THREE.SphereGeometry(R * 0.98, 32, 10, 0, Math.PI, 0, Math.PI / 2);
    // half-dome bulging along +Z, then rotated to each side
    g.translate(0, hallH + 2.2, R * 0.92).rotateY(ang);
    add(g, mat.lead);
  }
  // Corner domes & weight turrets
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = sx * (S / 2 - 8), cz = sz * (S / 2 - 8);
    add(new THREE.CylinderGeometry(5.2, 5.2, 2.4, 20).translate(cx, hallH + 1.2, cz));
    add(new THREE.SphereGeometry(5.3, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(cx, hallH + 2.4, cz), mat.lead);
    const tx = sx * (R + 1.8), tz = sz * (R + 1.8);
    add(new THREE.CylinderGeometry(1.6, 1.8, 8, 8).translate(tx, yD + 1, tz));
    add(new THREE.SphereGeometry(1.7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(tx, yD + 5, tz), mat.lead);
    add(new THREE.ConeGeometry(0.25, 1.8, 6).translate(tx, yD + 7.4, tz), mat.lead);
  }

  // Four minarets (88 m) at the corners of the prayer hall, three balconies each
  const minaret = minaretGroup(mat);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const m = minaret.clone();
    m.position.set(sx * (hallW / 2 + 1.5), 0, sz * (hallLen / 2 + 1.5));
    local.add(m);
  }

  // Courtyard with domed arcades and the ablution fountain (şadırvan)
  const court = new THREE.Group();
  const cCF = (ci0 + ci1) / 2, cCS = (cs0 + cs1) / 2;
  const [cx, cz] = toWorld(cCF, cCS);
  court.position.set(cx, yG, cz);
  court.rotation.y = local.rotation.y;
  group.add(court);
  const cl = ci1 - ci0, cw = cs1 - cs0, depth = 7, archH = 7.5;
  const arcade = (len, along, pos) => {
    // arcade wing: back wall + roof slab + a row of small lead domes
    const g = [];
    g.push(along === 'x' ? new THREE.BoxGeometry(len, archH, depth).translate(0, archH / 2, pos) : new THREE.BoxGeometry(depth, archH, len).translate(pos, archH / 2, 0));
    add(mergeGeometries(g), mat.whiteStone, court);
    const n = Math.max(2, Math.round(len / 6.5));
    const domes = [];
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (len / n) * (i + 0.5);
      const dg = new THREE.SphereGeometry(2.7, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      dg.translate(along === 'x' ? t : pos, archH, along === 'x' ? pos : t);
      domes.push(dg);
    }
    add(mergeGeometries(domes), mat.lead, court);
    // arch openings facing the court
    const arches = [];
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (len / n) * (i + 0.5);
      const off = pos > 0 ? -depth / 2 - 0.05 : depth / 2 + 0.05;
      arches.push(along === 'x' ? new THREE.BoxGeometry(3.6, 5, 0.2).translate(t, 2.6, pos + off) : new THREE.BoxGeometry(0.2, 5, 3.6).translate(pos + off, 2.6, t));
    }
    add(mergeGeometries(arches), new THREE.MeshStandardMaterial({ color: '#6e655a', roughness: 0.9 }), court);
  };
  arcade(cw + 2 * depth, 'x', -cl / 2 - depth / 2);
  arcade(cl, 'z', -cw / 2 - depth / 2);
  arcade(cl, 'z', cw / 2 + depth / 2);
  // Court paving & şadırvan
  add(new THREE.BoxGeometry(cw, 0.2, cl).translate(0, 0.1, 0), mat.paving, court);
  add(new THREE.CylinderGeometry(3.2, 3.4, 2.6, 8).translate(0, 1.3, 0), mat.whiteStone, court);
  add(new THREE.CylinderGeometry(4.6, 4.6, 0.3, 8).translate(0, 4.6, 0), mat.lead, court);
  add(new THREE.SphereGeometry(3.4, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 4.7, 0), mat.lead, court);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 6).translate(Math.cos(a) * 4.1, 3.6, Math.sin(a) * 4.1), mat.whiteStone, court);
  }

  shadowed(group);
  return {
    group,
    anchor: new THREE.Vector3(hx, yG + 92, hz),
    focus: new THREE.Vector3(hx, yG + 25, hz),
    facing: local.rotation.y,
  };
}

function minaretGroup(mat) {
  const g = new THREE.Group();
  const H = 88;
  const s = mat.whiteStone;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(5, 21, 5).translate(0, 10.5, 0), s));
  g.add(new THREE.Mesh(lathe([[2.5, 21], [2.1, 24], [2.0, 24]], 16), s));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.0, H - 30, 16).translate(0, 24 + (H - 30) / 2, 0), s));
  for (const y of [48, 61, 73]) {
    g.add(new THREE.Mesh(lathe([[1.7, y - 1.6], [2.9, y - 0.2], [2.9, y + 0.3], [1.7, y + 0.3]], 16), s));
    // railing
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.85, 1.0, 16, 1, true).translate(0, y + 0.8, 0), new THREE.MeshStandardMaterial({ color: '#d9d4ca', side: THREE.DoubleSide })));
  }
  // pencil cap & alem
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.75, 4, 16).translate(0, H - 8, 0), s));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(1.85, 7.5, 16).translate(0, H - 2.25, 0), mat.lead));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6).translate(0, H + 2.2, 0), new THREE.MeshStandardMaterial({ color: '#c79b3c', metalness: 0.9, roughness: 0.3 })));
  return g;
}
