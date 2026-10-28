import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

// Map-style controls (left-drag pan, right-drag orbit, wheel zoom to cursor) with
// terrain-aware constraints, plus smooth arced fly-to animations.
export function createCameraRig(camera, dom, terrain) {
  const controls = new MapControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.minDistance = 25;
  controls.maxDistance = 14000;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 1.2;
  controls.keys = { LEFT: 'KeyA', UP: 'KeyW', RIGHT: 'KeyD', BOTTOM: 'KeyS' };
  controls.listenToKeyEvents(window);
  controls.keyPanSpeed = 25;

  const bounds = { minX: -9000, maxX: 9000, minZ: -9000, maxZ: 9000 };
  let flight = null;

  function constrain() {
    const t = controls.target;
    t.x = THREE.MathUtils.clamp(t.x, bounds.minX, bounds.maxX);
    t.z = THREE.MathUtils.clamp(t.z, bounds.minZ, bounds.maxZ);
    // Keep the pivot resting on the ground so orbiting feels anchored.
    if (!flight) {
      const gy = terrain.heightAt(t.x, t.z);
      t.y += (gy - t.y) * 0.08;
    }
    // Never go below ground.
    const minY = terrain.heightAt(camera.position.x, camera.position.z) + 6;
    if (camera.position.y < minY) camera.position.y = minY;
  }

  function flyTo(position, target, { duration } = {}) {
    if (flight) flight.resolve(false);
    const from = { p: camera.position.clone(), t: controls.target.clone() };
    const dist = from.p.distanceTo(position) + from.t.distanceTo(target);
    const dur = duration ?? THREE.MathUtils.clamp(1.4 + dist / 4000, 1.6, 4.5);
    return new Promise((resolve) => {
      flight = { from, to: { p: position.clone(), t: target.clone() }, start: performance.now(), dur: dur * 1000, arc: Math.min(dist * 0.18, 1600), resolve };
      controls.enabled = false;
    });
  }

  function cancelFlight() {
    if (!flight) return;
    flight.resolve(false);
    flight = null;
    controls.enabled = true;
  }

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  function update() {
    if (flight) {
      const k = Math.min(1, (performance.now() - flight.start) / flight.dur);
      const e = ease(k);
      camera.position.lerpVectors(flight.from.p, flight.to.p, e);
      camera.position.y += Math.sin(Math.PI * e) * flight.arc;
      controls.target.lerpVectors(flight.from.t, flight.to.t, e);
      camera.lookAt(controls.target);
      if (k >= 1) {
        const f = flight;
        flight = null;
        controls.enabled = true;
        f.resolve(true);
      }
    } else {
      controls.update();
    }
    constrain();
    // Adapt the near plane to altitude for depth precision on distant terrain.
    const agl = camera.position.y - terrain.heightAt(camera.position.x, camera.position.z);
    const near = THREE.MathUtils.clamp(agl * 0.15, 0.5, 60);
    if (Math.abs(near - camera.near) / camera.near > 0.15) { camera.near = near; camera.updateProjectionMatrix(); }
  }

  // Slow orbit around the current target (used by the guided tour).
  function orbit(deltaRad) {
    const off = camera.position.clone().sub(controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), deltaRad);
    camera.position.copy(controls.target).add(off);
    camera.lookAt(controls.target);
  }

  return { controls, flyTo, cancelFlight, update, orbit, get flying() { return !!flight; } };
}
