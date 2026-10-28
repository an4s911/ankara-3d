import * as THREE from 'three';
import { centroid, shadowed, lathe } from './util.js';

// Atakule: 125 m concrete tower on Çankaya hill with a glass "tulip" head.
export function buildAtakule({ terrain, lm, mat }) {
  const group = new THREE.Group();
  group.name = 'Atakule';
  const [x, z] = centroid(lm.atakuleTower.pts);
  const y = terrain.heightAt(x, z) + 9; // stands on the roof plaza of its shopping centre podium
  const t = new THREE.Group();
  t.position.set(x, y - 9, z);
  group.add(t);

  // Shaft: base flare + slender concrete column
  t.add(new THREE.Mesh(lathe([[0.001, 0], [11, 0], [11, 1.5], [8.5, 3], [6.4, 12], [5.6, 84], [6.2, 87], [0.001, 87]], 40), mat.concrete));
  // three vertical service ribs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(1.8, 78, 1.8), mat.concrete);
    rib.position.set(Math.cos(a) * 5.7, 46, Math.sin(a) * 5.7);
    rib.rotation.y = -a;
    t.add(rib);
  }
  // The flaring bowl under the head
  t.add(new THREE.Mesh(lathe([[5.8, 86], [8, 90], [11.5, 95], [13.6, 97.5], [0.001, 97.5]], 40), mat.concrete));
  // Glass head with the revolving restaurant; warm interior glow
  const glass = new THREE.MeshStandardMaterial({
    color: '#7a5c40', roughness: 0.06, metalness: 1, envMap: mat.glass.envMap, envMapIntensity: 1.6,
    emissive: '#ff9a4a', emissiveIntensity: 0.12,
  });
  t.add(new THREE.Mesh(lathe([[13.6, 97.5], [14.2, 101], [14.2, 108], [13.2, 111], [0.001, 111]], 48), glass));
  // floor bands
  for (const yy of [101.5, 105, 108.4]) {
    t.add(new THREE.Mesh(new THREE.CylinderGeometry(14.35, 14.35, 0.35, 48).translate(0, yy, 0), mat.concrete));
  }
  // vertical mullions
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 10.5, 0.3), mat.concrete);
    m.position.set(Math.cos(a) * 14.25, 104, Math.sin(a) * 14.25);
    m.rotation.y = -a;
    t.add(m);
  }
  // Cap dome and spire
  t.add(new THREE.Mesh(lathe([[13.4, 111], [12.2, 114], [9, 117.5], [5, 120], [1.6, 121.5], [0.001, 121.8]], 40), mat.whiteStone));
  t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 4.5, 8).translate(0, 123.8, 0), mat.steel));
  // aviation light
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8).translate(0, 126.3, 0),
    new THREE.MeshBasicMaterial({ color: '#ff4a2a' }));
  t.add(beacon);

  shadowed(group);
  beacon.castShadow = false;
  return {
    group,
    anchor: new THREE.Vector3(x, y - 9 + 132, z),
    focus: new THREE.Vector3(x, y + 45, z),
    facing: 0,
    update(time) {
      beacon.material.color.setScalar(0).setRGB(Math.sin(time * 3) > 0.2 ? 3 : 0.4, 0.25, 0.1);
    },
  };
}
