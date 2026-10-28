import * as THREE from 'three';
import { mulberry } from './groundTexture.js';

function canvasTexture(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Facade: 4 bays × 4 floors per tile; each bay is 3.2 m wide, each floor 3.1 m tall.
function facadeTexture() {
  const rnd = mulberry(3);
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const cw = w / 4, ch = h / 4;
    for (let fy = 0; fy < 4; fy++) {
      for (let bx = 0; bx < 4; bx++) {
        const x = bx * cw, y = fy * ch;
        // slab line between floors
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(x, y + ch - 6, cw, 6);
        const wx = x + cw * 0.18, wy = y + ch * 0.22, ww = cw * 0.64, wh = ch * 0.56;
        // glass: mostly dark with warm sky reflection on some panes
        const lit = rnd();
        const g = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        if (lit < 0.18) { g.addColorStop(0, '#f2c58a'); g.addColorStop(1, '#a8794a'); }
        else if (lit < 0.6) { g.addColorStop(0, '#6a7686'); g.addColorStop(1, '#2d3440'); }
        else { g.addColorStop(0, '#4d5560'); g.addColorStop(1, '#23272d'); }
        ctx.fillStyle = '#d9d2c6';
        ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 8);
        ctx.fillStyle = g;
        ctx.fillRect(wx, wy, ww, wh);
        // mullion & curtains
        ctx.fillStyle = 'rgba(230,225,215,0.9)';
        ctx.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
        if (rnd() < 0.35) {
          ctx.fillStyle = `rgba(${200 + rnd() * 50},${190 + rnd() * 40},${170 + rnd() * 40},0.75)`;
          ctx.fillRect(wx, wy, ww * (0.2 + rnd() * 0.3), wh);
        }
        // balcony on some bays (Ankara apartments love balconies)
        if (rnd() < 0.3) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(x + 4, wy + wh * 0.62, cw - 8, wh * 0.38 + 5);
          ctx.fillStyle = 'rgba(250,248,240,0.9)';
          ctx.fillRect(x + 4, wy + wh * 0.6, cw - 8, 3);
        }
      }
    }
  });
}

function glassTexture() {
  const rnd = mulberry(11);
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8fa3b5';
    ctx.fillRect(0, 0, w, h);
    const cw = w / 4, ch = h / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 130 + rnd() * 60;
      ctx.fillStyle = `rgb(${v * 0.8},${v * 0.92},${v})`;
      ctx.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 6);
    }
    ctx.fillStyle = '#c8ccd0';
    for (let y = 0; y < 4; y++) ctx.fillRect(0, y * ch + ch - 5, w, 5);
  });
}

// Stone with a regular colonnade rhythm (Anıtkabir arcades).
function colonnadeTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#efe4cf';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(70,55,40,0.55)';
    for (let i = 0; i < 4; i++) ctx.fillRect(i * 64 + 14, 40, 36, 190);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 26, w, 6);
  });
}

// Ashlar stone blocks
export function stoneTexture(base = '#7a6f62', seed = 5) {
  const rnd = mulberry(seed);
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -16 : 0;
      while (x < w) {
        const bw = 24 + rnd() * 30;
        const v = (rnd() - 0.5) * 40;
        ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 240 : 0},${v > 0 ? 220 : 0},${Math.abs(v) / 200})`;
        ctx.fillRect(x + 1, r * (h / rows) + 1, bw - 2, h / rows - 2);
        x += bw;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, r * (h / rows), w, 1.5);
    }
  });
}

// Historic facade with arched windows (Republic-era "First National Architecture").
function archedTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (let fy = 0; fy < 2; fy++) for (let bx = 0; bx < 2; bx++) {
      const x = bx * 128 + 36, y = fy * 128 + 30, ww = 56, wh = 78;
      ctx.fillStyle = '#3b3530';
      ctx.beginPath();
      ctx.moveTo(x, y + wh);
      ctx.lineTo(x, y + ww / 2);
      ctx.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0);
      ctx.lineTo(x + ww, y + wh);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,60,0.5)';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 122, w, 6);
  });
}

function roadTexture() {
  return canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const rnd = mulberry(2);
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    // dashed centre line + solid edges (only visible on major roads via UV range)
    ctx.fillStyle = 'rgba(240,235,220,0.9)';
    ctx.fillRect(w / 2 - 1, 0, 2, h * 0.55);
    ctx.fillRect(2, 0, 1.5, h);
    ctx.fillRect(w - 3.5, 0, 1.5, h);
  });
}

export function createMaterials(envMap) {
  const facade = facadeTexture();
  const m = {
    facade: new THREE.MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.82, metalness: 0.02 }),
    glass: new THREE.MeshStandardMaterial({
      map: glassTexture(), vertexColors: true, roughness: 0.12, metalness: 0.75, envMap, envMapIntensity: 1.1,
    }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    colonnade: new THREE.MeshStandardMaterial({ map: colonnadeTexture(), roughness: 0.7 }),
    arched: new THREE.MeshStandardMaterial({ map: archedTexture(), vertexColors: true, roughness: 0.8 }),
    road: new THREE.MeshStandardMaterial({
      map: roadTexture(), vertexColors: true, roughness: 0.92,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }),
    travertine: new THREE.MeshStandardMaterial({ map: stoneTexture('#e9dcc2', 9), roughness: 0.65 }),
    travertinePlain: new THREE.MeshStandardMaterial({ color: '#eadcc0', roughness: 0.6 }),
    andesite: new THREE.MeshStandardMaterial({ map: stoneTexture('#7b6d60', 4), roughness: 0.95 }),
    whiteStone: new THREE.MeshStandardMaterial({ color: '#ece8e0', roughness: 0.55 }),
    lead: new THREE.MeshStandardMaterial({ color: '#7e8791', roughness: 0.45, metalness: 0.45, envMap, envMapIntensity: 0.6 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 0.45, metalness: 0.8, envMap }),
    concrete: new THREE.MeshStandardMaterial({ color: '#d6d0c4', roughness: 0.7 }),
    tile: new THREE.MeshStandardMaterial({ color: '#a4533a', roughness: 0.85 }),
    water: new THREE.MeshStandardMaterial({
      color: '#2e5a6e', roughness: 0.06, metalness: 0.9, envMap, envMapIntensity: 1.2,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    }),
    paving: new THREE.MeshStandardMaterial({ color: '#d9cdb5', roughness: 0.8 }),
    steel: new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.35, metalness: 0.7, envMap }),
  };
  return m;
}
