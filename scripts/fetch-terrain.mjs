// Downloads AWS Terrarium elevation tiles and resamples them onto regular grids
// in the local metric frame. Output: public/data/terrain.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { TERRAIN, OUTER_TERRAIN, unproject } from '../src/config.js';

const OUT = path.resolve('public/data');
const CACHE = path.resolve('.cache/terrain');
const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const tiles = new Map();

async function getTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tiles.has(key)) return tiles.get(key);
  const file = path.join(CACHE, `${z}_${x}_${y}.png`);
  let buf;
  try {
    buf = await fs.readFile(file);
  } catch {
    const res = await fetch(TILE_URL(z, x, y));
    if (!res.ok) throw new Error(`tile ${key}: HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(file, buf);
  }
  const png = PNG.sync.read(buf);
  const h = new Float32Array(256 * 256);
  for (let i = 0; i < h.length; i++) {
    const r = png.data[i * 4], g = png.data[i * 4 + 1], b = png.data[i * 4 + 2];
    h[i] = r * 256 + g + b / 256 - 32768;
  }
  tiles.set(key, h);
  return h;
}

function globalPixel(lat, lon, z) {
  const n = 2 ** z * 256;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return [x, y];
}

async function samplePx(px, py, z) {
  const tx = Math.floor(px / 256), ty = Math.floor(py / 256);
  const t = await getTile(z, tx, ty);
  const ix = Math.min(255, Math.max(0, Math.floor(px - tx * 256)));
  const iy = Math.min(255, Math.max(0, Math.floor(py - ty * 256)));
  return t[iy * 256 + ix];
}

async function sample(lat, lon, z) {
  const [x, y] = globalPixel(lat, lon, z);
  const fx = x - 0.5, fy = y - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const ax = fx - x0, ay = fy - y0;
  const h00 = await samplePx(x0, y0, z), h10 = await samplePx(x0 + 1, y0, z);
  const h01 = await samplePx(x0, y0 + 1, z), h11 = await samplePx(x0 + 1, y0 + 1, z);
  return (h00 * (1 - ax) + h10 * ax) * (1 - ay) + (h01 * (1 - ax) + h11 * ax) * ay;
}

async function buildGrid(spec, zoom) {
  const nx = Math.round((spec.maxX - spec.minX) / spec.step) + 1;
  const nz = Math.round((spec.maxZ - spec.minZ) / spec.step) + 1;
  const data = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [lat, lon] = unproject(spec.minX + i * spec.step, spec.minZ + j * spec.step);
      data[j * nx + i] = await sample(lat, lon, zoom);
    }
  }
  let min = Infinity, max = -Infinity;
  for (const v of data) { min = Math.min(min, v); max = Math.max(max, v); }
  console.log(`grid ${nx}x${nz} @${spec.step}m (z${zoom}): ${min.toFixed(0)}–${max.toFixed(0)} m`);
  return { nx, nz, data };
}

await fs.mkdir(CACHE, { recursive: true });
await fs.mkdir(OUT, { recursive: true });

const inner = await buildGrid(TERRAIN, 14);
const outer = await buildGrid(OUTER_TERRAIN, 10);

// Heights are stored relative to a base elevation, in decimetres, as base64 Int16
// inside terrain.json (one plain JSON file, served anywhere).
const base = Math.floor(inner.data.reduce((m, v) => Math.min(m, v), Infinity));
const all = new Int16Array(inner.data.length + outer.data.length);
inner.data.forEach((v, i) => (all[i] = Math.round((v - base) * 10)));
outer.data.forEach((v, i) => (all[inner.data.length + i] = Math.round((v - base) * 10)));
await fs.writeFile(
  path.join(OUT, 'terrain.json'),
  JSON.stringify({
    baseElevation: base,
    inner: { ...TERRAIN, nx: inner.nx, nz: inner.nz, offset: 0 },
    outer: { ...OUTER_TERRAIN, nx: outer.nx, nz: outer.nz, offset: inner.data.length },
    heights: Buffer.from(all.buffer).toString('base64'),
  }),
);
console.log(`wrote terrain.json (${(all.byteLength / 1e6).toFixed(1)} MB of heights), base elevation ${base} m`);
