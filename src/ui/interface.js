import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { unproject } from '../config.js';

const $ = (id) => document.getElementById(id);

export function createInterface({ landmarks, rig, camera, scene, terrain, overview, renderer }) {
  const byId = Object.fromEntries(landmarks.map((l) => [l.id, l]));
  let active = null;

  // ----- Menu
  const items = $('menu-items');
  landmarks.forEach((l, i) => {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.dataset.id = l.id;
    b.innerHTML = `<span class="num">${i + 1}</span><span><b>${l.name}</b><small>${l.subtitle}</small></span>`;
    items.appendChild(b);
  });
  document.querySelectorAll('.menu-item').forEach((b) => b.addEventListener('click', () => {
    tour.stop();
    b.dataset.id === 'overview' ? goOverview() : goTo(b.dataset.id);
    if (window.innerWidth <= 720) setMenu(false);
  }));
  const menu = $('menu');
  const setMenu = (open) => { menu.classList.toggle('collapsed', !open); $('menu-toggle').setAttribute('aria-expanded', open); };
  $('menu-toggle').addEventListener('click', () => setMenu(menu.classList.contains('collapsed')));
  if (window.innerWidth <= 720) setMenu(false);

  function setActive(id) {
    active = id;
    document.querySelectorAll('.menu-item').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  }

  // ----- Info card
  const card = $('card');
  function showCard(l) {
    $('card-sub').textContent = l.subtitle;
    $('card-title').textContent = l.name;
    $('card-en').textContent = l.en;
    $('card-text').textContent = l.text;
    $('card-stats').innerHTML = l.stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('card-built').textContent = `Built: ${l.built}`;
    $('card-arch').textContent = l.architect;
    card.classList.remove('hidden');
  }
  const hideCard = () => card.classList.add('hidden');
  $('card-close').addEventListener('click', hideCard);

  async function goTo(id, opts) {
    const l = byId[id];
    setActive(id);
    hideCard();
    const done = await rig.flyTo(l.camera.position, l.camera.target, opts);
    if (done) showCard(l);
    return done;
  }
  function goOverview() {
    setActive('overview');
    hideCard();
    return rig.flyTo(overview.position, overview.target);
  }

  // ----- Floating labels
  const labelObjs = landmarks.map((l, i) => {
    const div = document.createElement('div');
    div.className = 'label';
    div.innerHTML = `<div class="pill"><i>${i + 1}</i>${l.name}</div><div class="stem"></div>`;
    div.addEventListener('pointerdown', (e) => e.stopPropagation());
    div.addEventListener('click', () => { tour.stop(); goTo(l.id); });
    const obj = new CSS2DObject(div);
    obj.position.copy(l.anchor);
    obj.center.set(0.5, 1);
    scene.add(obj);
    return { obj, div, l };
  });
  function updateLabels() {
    for (const { obj, div } of labelObjs) {
      const d = camera.position.distanceTo(obj.position);
      const o = d > 17000 ? 0 : d > 12000 ? (17000 - d) / 5000 : d < 60 ? 0 : 1;
      div.style.opacity = o.toFixed(2);
      div.style.pointerEvents = o < 0.2 ? 'none' : 'auto';
    }
  }

  // ----- Picking landmarks in 3D
  const ray = new THREE.Raycaster();
  const pickables = landmarks.map((l) => l.group);
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; tour.interrupt(); });
  renderer.domElement.addEventListener('wheel', () => tour.interrupt(), { passive: true });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickables, true)[0];
    if (hit) { const id = hit.object.userData.landmarkId; if (id) { tour.stop(); goTo(id); } }
  });

  // ----- Guided tour
  const tour = createTour({ landmarks, goTo, goOverview, rig, showCard, hideCard, overview });
  $('tour-start').addEventListener('click', () => tour.start());

  // ----- HUD
  const needle = $('needle');
  $('compass').addEventListener('click', () => {
    const t = rig.controls.target, p = camera.position;
    const d = Math.hypot(p.x - t.x, p.z - t.z);
    rig.flyTo(new THREE.Vector3(t.x, p.y, t.z + d), t.clone(), { duration: 1.2 });
  });
  $('btn-reset').addEventListener('click', () => { tour.stop(); goOverview(); });
  $('btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
  });
  const coords = $('coords');
  let lastCoord = 0;

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= landmarks.length) { tour.stop(); goTo(landmarks[n - 1].id); }
    else if (e.key === '0') { tour.stop(); goOverview(); }
    else if (e.key === 't' || e.key === 'T') tour.running ? tour.stop() : tour.start();
    else if (e.key === 'Escape') { hideCard(); tour.stop(); }
  });

  function update(time, dt) {
    updateLabels();
    tour.update(dt);
    const t = rig.controls.target;
    const az = Math.atan2(camera.position.x - t.x, camera.position.z - t.z);
    needle.setAttribute('transform', `rotate(${THREE.MathUtils.radToDeg(az)} 20 20)`);
    if (time - lastCoord > 0.25) {
      lastCoord = time;
      const [lat, lon] = unproject(t.x, t.z);
      coords.textContent = `${lat.toFixed(4)}° N  ${lon.toFixed(4)}° E  ·  ${Math.round(terrain.elevationAt(t.x, t.z))} m`;
    }
  }

  return { update, goTo, goOverview, tour, get active() { return active; } };
}

function createTour({ landmarks, goTo, goOverview, rig, showCard, hideCard, overview }) {
  const bar = $('tour-bar'), label = $('tour-label'), progress = $('tour-progress'), pauseBtn = $('tour-pause');
  const steps = [{ id: 'overview', dwell: 4 }, ...landmarks.map((l) => ({ id: l.id, dwell: 10 })), { id: 'finale', dwell: 6 }];
  let idx = -1, running = false, paused = false, dwell = 0, phase = 'idle', token = 0;

  async function play(i) {
    idx = i;
    if (idx >= steps.length) return stop();
    const s = steps[idx];
    const my = ++token;
    phase = 'flying';
    progress.style.width = `${(idx / steps.length) * 100}%`;
    let ok;
    if (s.id === 'overview') { label.textContent = 'Ankara — overview'; ok = await goOverview(); }
    else if (s.id === 'finale') {
      label.textContent = 'Farewell flyover';
      hideCard();
      ok = await rig.flyTo(overview.finale.position, overview.finale.target, { duration: 5 });
    } else {
      label.textContent = `${idx} / ${landmarks.length} · ${landmarks.find((l) => l.id === s.id).name}`;
      ok = await goTo(s.id, { duration: 4.2 });
    }
    if (my !== token || !running) return;
    if (!ok) return;
    phase = 'dwell';
    dwell = s.dwell;
  }

  function start() {
    running = true; paused = false;
    bar.classList.remove('hidden');
    pauseBtn.textContent = '❚❚ Pause';
    play(0);
  }
  function stop() {
    if (!running) return;
    running = false; phase = 'idle'; token++;
    bar.classList.add('hidden');
  }
  function setPaused(p) {
    paused = p;
    pauseBtn.textContent = p ? '▶ Resume' : '❚❚ Pause';
    if (p && phase === 'flying') { rig.cancelFlight(); phase = 'dwell'; dwell = Math.max(dwell, 3); }
  }
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  $('tour-next').addEventListener('click', () => { if (!running) return; rig.cancelFlight(); paused = false; pauseBtn.textContent = '❚❚ Pause'; play(idx + 1); });
  $('tour-exit').addEventListener('click', stop);

  return {
    start, stop,
    get running() { return running; },
    interrupt() { if (running && !paused) setPaused(true); },
    update(dt) {
      if (!running || paused || phase !== 'dwell') return;
      rig.orbit(dt * 0.07);
      dwell -= dt;
      const s = steps[idx];
      progress.style.width = `${((idx + 1 - Math.max(0, dwell) / s.dwell) / steps.length) * 100}%`;
      if (dwell <= 0) { phase = 'next'; play(idx + 1); }
    },
  };
}
