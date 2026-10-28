import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import './style.css';
import { loadTerrain } from './scene/terrain.js';
import { paintGround } from './scene/groundTexture.js';
import { createRenderer, createSky, createLights, createComposer } from './scene/environment.js';
import { createMaterials } from './scene/materials.js';
import { buildCity } from './scene/buildings.js';
import { buildRoads } from './scene/roads.js';
import { buildTrees, buildSprawl } from './scene/vegetation.js';
import { buildLandmarks, heroCamera } from './landmarks/index.js';
import { createCameraRig } from './ui/camera.js';
import { createInterface } from './ui/interface.js';

const BASE = import.meta.env.BASE_URL;
const isMobile = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
const params = new URLSearchParams(location.search);

const fill = document.getElementById('loader-fill');
const stepEl = document.getElementById('loader-step');
let lastStep = performance.now();
const progress = (p, msg) => {
  if (params.has('debug')) console.info(`[load] ${(performance.now() - lastStep).toFixed(0)} ms → ${msg}`);
  lastStep = performance.now();
  fill.style.width = `${p}%`;
  stepEl.textContent = msg;
  return new Promise((r) => setTimeout(r, 16));
};

async function main() {
  const container = document.getElementById('app');
  const renderer = createRenderer(container);
  if (isMobile) renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 2, 90000);

  await progress(5, 'Loading terrain');
  const json = (name) => fetch(`${BASE}data/${name}.json`).then((r) => r.json());
  const [terrain, buildings, roads, areas, trees, lm] = await Promise.all([
    loadTerrain(BASE), json('buildings'), json('roads'), json('areas'), json('trees'), json('landmarks'),
  ]);

  await progress(25, 'Lighting the golden hour');
  const { env } = createSky(scene, renderer);
  const lights = createLights(scene);
  const mat = createMaterials(env);
  if (isMobile) lights.sun.shadow.mapSize.set(2048, 2048);

  await progress(35, 'Painting the streets');
  const maxTex = Math.min(renderer.capabilities.maxTextureSize, Number(params.get('texsize')) || (isMobile ? 4096 : 6144));
  const ground = paintGround(terrain, { buildings: buildings.items, roads: roads.items, areas: areas.items }, maxTex);
  scene.add(terrain.buildInnerMesh(ground));
  scene.add(terrain.buildOuterMesh());

  await progress(50, 'Raising 25,000 buildings');
  scene.add(buildCity(buildings.items, mat));
  await progress(60, 'Paving the boulevards');
  scene.add(buildRoads(roads.items, terrain, mat));

  await progress(68, 'Planting trees');
  scene.add(buildTrees(trees.items, terrain));
  scene.add(buildSprawl(terrain));

  await progress(80, 'Sculpting the landmarks');
  const landmarks = buildLandmarks({ terrain, lm, mat });
  for (const l of landmarks) scene.add(l.group);

  await progress(92, 'Warming up the GPU');
  const { composer } = createComposer(renderer, scene, camera);
  const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 3 });

  const rig = createCameraRig(camera, renderer.domElement, terrain);
  const overviewTarget = new THREE.Vector3(-150, terrain.heightAt(-150, -500), -500);
  const overview = {
    ...heroCamera(overviewTarget, { azimuth: 200, elevation: 34, distance: 7600 }),
    finale: heroCamera(new THREE.Vector3(-300, terrain.heightAt(-300, 800), 800), { azimuth: 160, elevation: 22, distance: 6200 }),
  };
  // Open on a cinematic approach toward the overview.
  const intro = heroCamera(overviewTarget, { azimuth: 225, elevation: 22, distance: 11000 });
  camera.position.copy(intro.position);
  rig.controls.target.copy(intro.target);
  camera.lookAt(intro.target);

  const ui = createInterface({ landmarks, rig, camera, scene, terrain, overview, renderer });

  // Optional deep link: ?view=kocatepe
  const deep = params.get('view');

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  renderer.info.autoReset = false;
  const clock = new THREE.Clock();
  let frames = 0, fpsTime = 0, degraded = false;
  window.__ankara = { renderer, scene, camera, rig, ui, landmarks, fps: 0 };
  // ?frames=N renders N frames then stops (used for automated screenshots on slow software GL).
  let frameBudget = params.has('frames') ? parseInt(params.get('frames'), 10) : Infinity;
  renderer.setAnimationLoop(() => {
    if (frameBudget-- <= 0) { renderer.setAnimationLoop(null); window.__ankara.stopped = true; return; }
    renderer.info.reset();
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;
    rig.update();
    lights.update(rig.controls.target, camera.position.distanceTo(rig.controls.target));
    for (const l of landmarks) l.update?.(time);
    ui.update(time, dt);
    composer.render();
    labelRenderer.render(scene, camera);
    // Adaptive quality: drop resolution if the GPU is struggling.
    frames++; fpsTime += dt;
    if (fpsTime > 2) {
      window.__ankara.fps = frames / fpsTime;
      if (!degraded && window.__ankara.fps < 28 && time > 6 && !params.has('noadapt')) {
        degraded = true;
        renderer.setPixelRatio(1);
        resize();
      }
      frames = 0; fpsTime = 0;
    }
  });

  await progress(100, 'Hoş geldiniz');
  document.getElementById('loader').classList.add('done');
  const cam = params.get('cam')?.split(',').map(Number);
  if (cam?.length === 6) {
    // ?cam=x,y,z,tx,ty,tz — explicit camera (y values are metres above the ground)
    camera.position.set(cam[0], terrain.heightAt(cam[0], cam[2]) + cam[1], cam[2]);
    rig.controls.target.set(cam[3], terrain.heightAt(cam[3], cam[5]) + cam[4], cam[5]);
    camera.lookAt(rig.controls.target);
  } else if (deep === 'overview') { camera.position.copy(overview.position); rig.controls.target.copy(overview.target); }
  else if (deep && landmarks.find((l) => l.id === deep)) {
    const l = landmarks.find((x) => x.id === deep);
    camera.position.copy(l.camera.position); rig.controls.target.copy(l.camera.target); camera.lookAt(l.camera.target);
  } else {
    setTimeout(() => ui.goOverview(), 400);
  }
}

main().catch((err) => {
  console.error(err);
  document.getElementById('loader-step').textContent = 'Something went wrong: ' + err.message;
});
