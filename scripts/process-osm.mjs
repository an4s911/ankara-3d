// Turns the cached raw OSM data into compact, render-ready JSON:
//   buildings.json  — extrusion footprints with base/height/class/roof
//   roads.json      — classified polylines (roads + rail)
//   areas.json      — park / green / water polygons
//   trees.json      — tree positions (OSM trees + generated park/street trees)
//   landmarks.json  — real OSM footprints the custom landmark models align to
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadOSM } from './osm-load.mjs';
import { project, OSM_BBOX } from '../src/config.js';

const OUT = path.resolve('public/data');

// ---------- terrain sampler (same data the browser uses) ----------
const tmeta = JSON.parse(await fs.readFile(path.join(OUT, 'terrain.json'), 'utf8'));
const tdm = new Int16Array(new Uint8Array(Buffer.from(tmeta.heights, 'base64')).buffer);
const theights = Float32Array.from(tdm, (v) => v / 10);
function terrainY(x, z) {
  const g = tmeta.inner;
  const fx = Math.min(g.nx - 1.001, Math.max(0, (x - g.minX) / g.step));
  const fz = Math.min(g.nz - 1.001, Math.max(0, (z - g.minZ) / g.step));
  const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
  const h = (ii, jj) => theights[jj * g.nx + ii];
  return (h(i, j) * (1 - ax) + h(i + 1, j) * ax) * (1 - az) + (h(i, j + 1) * (1 - ax) + h(i + 1, j + 1) * ax) * az;
}

// ---------- helpers ----------
const { nodes, ways, relations } = await loadOSM();
const [bx0, bz0] = project(OSM_BBOX.north, OSM_BBOX.west);
const [bx1, bz1] = project(OSM_BBOX.south, OSM_BBOX.east);
const inBox = ([x, z], m = 0) => x > bx0 - m && x < bx1 + m && z > bz0 - m && z < bz1 + m;

function wayPts(w) {
  const pts = [];
  for (const id of w.nodes) {
    const n = nodes.get(id);
    if (n) pts.push(project(n.lat, n.lon));
  }
  return pts;
}
const isClosed = (w) => w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];
function area(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % n];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}
function centroid(ring) {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
}
// Remove closing duplicate, drop near-collinear / tiny-edge vertices.
function cleanRing(pts) {
  let r = pts.slice();
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  let changed = true;
  while (changed && r.length > 3) {
    changed = false;
    for (let i = 0; i < r.length && r.length > 3; i++) {
      const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length];
      const abx = b[0] - a[0], abz = b[1] - a[1], bcx = c[0] - b[0], bcz = c[1] - b[1];
      const cross = Math.abs(abx * bcz - abz * bcx);
      const lab = Math.hypot(abx, abz), lbc = Math.hypot(bcx, bcz);
      if (lab < 0.4 || cross / (lab * lbc + 1e-9) < 0.02) { r.splice(i, 1); changed = true; i--; }
    }
  }
  return r;
}
function isConvex(r) {
  let sign = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], c = r[(i + 2) % r.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-6) continue;
    const s = Math.sign(cr);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
function pointInRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// Deterministic hash → [0,1)
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
// Assemble outer rings of a multipolygon relation by joining member ways.
function relationRings(rel, role = 'outer') {
  const segs = rel.members.filter((m) => m.type === 'way' && (m.role === role || (role === 'outer' && m.role === '')))
    .map((m) => ways.get(m.ref)).filter(Boolean).map((w) => w.nodes.slice());
  const rings = [];
  while (segs.length) {
    let ring = segs.shift();
    let guard = 0;
    while (ring[0] !== ring[ring.length - 1] && guard++ < 500) {
      const end = ring[ring.length - 1];
      const k = segs.findIndex((s) => s[0] === end || s[s.length - 1] === end);
      if (k < 0) break;
      const s = segs.splice(k, 1)[0];
      ring = ring.concat(s[0] === end ? s.slice(1) : s.reverse().slice(1));
    }
    if (ring[0] === ring[ring.length - 1]) {
      const pts = ring.map((id) => nodes.get(id)).filter(Boolean).map((n) => project(n.lat, n.lon));
      if (pts.length === ring.length) rings.push(pts);
    }
  }
  return rings;
}
const q = (v) => Math.round(v * 10); // decimetre quantisation

// ---------- landmark footprints & exclusions ----------
const LANDMARK_WAYS = {
  anitkabirTomb: '28241512', anitkabirPlaza: '397556879', anitkabirLionsRoad: '267161017',
  anitkabirLionsArea: '397748869', anitkabirMuseum: '28241510',
  kocatepeOuter: '422198754', kocatepeInner: '422198755',
  akkale: '874846724',
  kaleWallInner1: '874846720', kaleWallInner2: '874846722', kaleWallInner3: '874846723',
  kaleWallOuter: '874846726', kaleWallOuter2: '874914866', kaleWallOuter3: '874846728', kaleWallLower: '874849843',
  genclikPark: '10711293', genclikLake: '419410129', genclikPool: '419410136', lunapark: '245048870',
  opera: '404878536',
  firstAssembly: '419393108', secondAssembly: '419393082',
  atakuleTower: '72079962', atakuleMall: '681425145',
};
const EXCLUDE_BUILDINGS = new Set(['28241512', '397750660', '874846724', '419393108', '419393082', '72079962']);
const EXCLUDE_RELATIONS = new Set(['6276462']); // Kocatepe Mosque

const landmarks = {};
for (const [key, id] of Object.entries(LANDMARK_WAYS)) {
  const w = ways.get(id);
  if (!w) { console.warn('missing landmark way', key, id); continue; }
  landmarks[key] = { closed: isClosed(w), pts: wayPts(w).map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]) };
}
// Anıtkabir 'Zafer Kulesi' etc. – keep the named monument nodes for reference
landmarks.zaferAniti = project(...(() => { const n = nodes.get('2726221369'); return [n.lat, n.lon]; })());
landmarks.anitkabirNode = project(...(() => { const n = nodes.get('34668145'); return [n.lat, n.lon]; })());

// Old town (Kale and the Altındağ slopes around it): traditional low houses with tiled roofs.
const OLD_TOWN = [[430, -2470], [1320, -2470], [1320, -1720], [880, -1700], [560, -1900], [430, -2150]];
// Anıtkabir precinct: its stone buildings use the monument material.
const ANITKABIR_ZONE = [[-1720, -780], [-1330, -780], [-1300, -380], [-1560, -360], [-1720, -620]];
const KIZILAY = [0, 0];

// ---------- buildings ----------
const CLS = { residential: 0, commercial: 1, civic: 2, old: 3, monument: 4, light: 5, mosque: 6, glass: 7 };
const COMMERCIAL = new Set(['office', 'commercial', 'retail', 'hotel', 'supermarket']);
const CIVIC = new Set(['university', 'school', 'hospital', 'public', 'government', 'kindergarten', 'college',
  'train_station', 'civic', 'dormitory', 'stadium', 'museum', 'church', 'transportation']);
const LIGHT = new Set(['roof', 'garage', 'garages', 'shed', 'construction', 'ruins', 'kiosk', 'service',
  'industrial', 'warehouse', 'greenhouse', 'hut', 'carport', 'container', 'toilets']);

function parseHeight(v) {
  if (!v) return undefined;
  const m = String(v).replace(',', '.').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : undefined;
}

function buildingRecord(id, tags, ring) {
  ring = cleanRing(ring);
  if (ring.length < 3) return null;
  let a = area(ring);
  if (Math.abs(a) < 8) return null;
  if (a > 0) ring.reverse(); // store clockwise in x/z (=counter-clockwise viewed from above with -Z north)
  a = Math.abs(a);
  const c = centroid(ring);
  if (!inBox(c)) return null;
  const type = tags.building || 'yes';
  const r = hash(id);
  const old = pointInRing(c, OLD_TOWN);
  const dist = Math.hypot(c[0] - KIZILAY[0], c[1] - KIZILAY[1]);

  let cls = CLS.residential;
  if (type === 'mosque' || tags.amenity === 'place_of_worship' && tags.religion === 'muslim') cls = CLS.mosque;
  else if (pointInRing(c, ANITKABIR_ZONE)) cls = CLS.monument;
  else if (LIGHT.has(type)) cls = CLS.light;
  else if (old && a < 400) cls = CLS.old;
  else if (COMMERCIAL.has(type) || tags.shop || tags.office) cls = CLS.commercial;
  else if (CIVIC.has(type) || tags.amenity && ['school', 'hospital', 'university', 'townhall', 'theatre', 'library'].includes(tags.amenity)) cls = CLS.civic;

  let h = parseHeight(tags.height);
  const levels = parseHeight(tags['building:levels']);
  if (h === undefined && levels !== undefined) h = levels * 3.1 + 1;
  if (h === undefined) {
    if (type === 'roof') h = 4;
    else if (cls === CLS.light) h = 3 + r * 2;
    else if (type === 'house' || type === 'detached') h = 6.5;
    else if (cls === CLS.old) h = (1 + Math.floor(r * 2.4)) * 3.2;
    else if (cls === CLS.mosque) h = Math.min(14, 6 + Math.sqrt(a) * 0.25);
    else if (a < 60) h = (1 + Math.floor(r * 2)) * 3.1;
    else if (a < 150) h = (2 + Math.floor(r * 3)) * 3.1 + 1;
    else {
      // Ankara's apartman blocks: taller near the centre.
      const lo = dist < 1600 ? 5 : 4, hi = dist < 1600 ? 10 : 8;
      let floors = lo + Math.floor(r * (hi - lo + 1));
      if (cls === CLS.civic) floors = 3 + Math.floor(r * 3);
      if (cls === CLS.commercial) floors = 5 + Math.floor(r * 6);
      h = floors * 3.1 + 1.2;
    }
  }
  if (tags['building:min_level'] || tags.min_height) return null; // floating parts not supported
  h = Math.max(2.5, Math.min(h, 260));
  if (cls === CLS.commercial && h > 55) cls = CLS.glass;
  else if (cls === CLS.residential && h > 75) cls = CLS.glass;

  // Pitched (hipped) roofs: traditional houses always, many lower apartment blocks too.
  let roof = 0;
  const floors = h / 3.1;
  if (isConvex(ring) && ring.length <= 10 && a < 900) {
    if (cls === CLS.old) roof = 1;
    else if (cls === CLS.residential && floors <= 7 && hash(id + 'r') < (dist < 1500 ? 0.25 : 0.55)) roof = 1;
    else if (type === 'house') roof = 1;
  }

  let base = Infinity, top = -Infinity;
  for (const [x, z] of ring) { const y = terrainY(x, z); base = Math.min(base, y); top = Math.max(top, y); }
  // On slopes the downhill side gets the full height; roofs stay level above the uphill side.
  const slope = top - base;
  return [q(base), q(h + Math.min(slope, 12) * 0.6), cls, roof, Math.floor(hash(id + 'c') * 256), ...ring.flatMap(([x, z]) => [q(x), q(z)])];
}

const buildings = [];
const mosques = [];
for (const w of ways.values()) {
  if (!w.tags.building || w.tags.building === 'no' || !isClosed(w)) continue;
  if (EXCLUDE_BUILDINGS.has(w.id)) continue;
  if (w.tags.location === 'underground' || parseHeight(w.tags.layer) < 0) continue;
  const rec = buildingRecord(w.id, w.tags, wayPts(w));
  if (rec) {
    buildings.push(rec);
    if (rec[2] === CLS.mosque) mosques.push(rec);
  }
}
for (const r of relations.values()) {
  if (!r.tags.building || EXCLUDE_RELATIONS.has(r.id)) continue;
  for (const ring of relationRings(r)) {
    const rec = buildingRecord('r' + r.id + ring.length, r.tags, ring);
    if (rec) buildings.push(rec);
  }
}

// ---------- roads ----------
const ROAD = {
  motorway: [0, 24], trunk: [0, 22], primary: [1, 17], secondary: [2, 13], tertiary: [3, 10],
  motorway_link: [3, 8], trunk_link: [3, 8], primary_link: [3, 8], secondary_link: [3, 7], tertiary_link: [3, 7],
  residential: [4, 7], unclassified: [4, 7], living_street: [4, 6], service: [5, 4.5], pedestrian: [6, 6],
  footway: [7, 2.5], path: [7, 2], steps: [7, 2.5], cycleway: [7, 2],
};
const BOULEVARDS = /Bulvarı|Atatürk Bulvarı|Gazi Mustafa Kemal|Talatpaşa|İnönü|Cemal Gürsel/;
const roads = [];
for (const w of ways.values()) {
  const t = w.tags;
  let cls, width;
  if (t.highway && ROAD[t.highway] && t.area !== 'yes') {
    [cls, width] = ROAD[t.highway];
    if (t.tunnel === 'yes' || t.tunnel === 'building_passage' || parseHeight(t.layer) < 0 || t.indoor === 'yes') continue;
    if (t.highway === 'footway' && (t.footway === 'sidewalk' || t.footway === 'crossing')) continue;
    if (t.name && BOULEVARDS.test(t.name) && cls <= 2) width *= 1.25;
    if (t.lanes) width = Math.max(width, parseHeight(t.lanes) * 3.4);
  } else if (t.railway === 'rail' && t.tunnel !== 'yes' && !(parseHeight(t.layer) < 0)) {
    cls = 8; width = 6;
  } else continue;
  const pts = wayPts(w);
  if (pts.length < 2 || !pts.some((p) => inBox(p, 50))) continue;
  roads.push([cls, Math.round(width * 10), ...pts.flatMap(([x, z]) => [q(x), q(z)])]);
}

// ---------- areas (parks, green, water) ----------
const AREA = { park: 0, garden: 0, grass: 1, meadow: 1, village_green: 1, recreation_ground: 1, cemetery: 1,
  forest: 2, wood: 2, scrub: 3, heath: 3, water: 4, pitch: 5, plaza: 6, swimming_pool: 4 };
function areaType(t) {
  if (t.natural === 'water' || t.water || t.leisure === 'swimming_pool' || t.amenity === 'fountain' && t.natural) return 4;
  if (t.leisure === 'pitch') return 5;
  if (t.highway === 'pedestrian' && t.area === 'yes' || t.place === 'square') return 6;
  for (const k of ['leisure', 'landuse', 'natural']) if (t[k] !== undefined && AREA[t[k]] !== undefined) return AREA[t[k]];
  return undefined;
}
const areas = [];
for (const w of ways.values()) {
  if (!isClosed(w)) continue;
  const at = areaType(w.tags);
  if (at === undefined || parseHeight(w.tags.layer) < 0) continue;
  const ring = cleanRing(wayPts(w));
  if (ring.length < 3 || !ring.some((p) => inBox(p, 100))) continue;
  areas.push([at, ...ring.flatMap(([x, z]) => [q(x), q(z)])]);
}
for (const r of relations.values()) {
  const at = areaType(r.tags);
  if (at === undefined || r.tags.type !== 'multipolygon') continue;
  for (const ring0 of relationRings(r)) {
    const ring = cleanRing(ring0);
    if (ring.length < 3 || !ring.some((p) => inBox(p, 100))) continue;
    areas.push([at, ...ring.flatMap(([x, z]) => [q(x), q(z)])]);
  }
}
// Draw order: big green first, water / plazas last.
const areaSize = (a) => { const r = []; for (let i = 1; i < a.length; i += 2) r.push([a[i], a[i + 1]]); return Math.abs(area(r)); };
areas.sort((a, b) => (a[0] >= 4) - (b[0] >= 4) || areaSize(b) - areaSize(a));

// ---------- trees ----------
// Spatial grid of building footprints so generated trees avoid them.
const GRID = 50;
const bgrid = new Map();
const bRings = buildings.map((b) => { const r = []; for (let i = 5; i < b.length; i += 2) r.push([b[i] / 10, b[i + 1] / 10]); return r; });
bRings.forEach((r, idx) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++)
    for (let gz = Math.floor(z0 / GRID); gz <= Math.floor(z1 / GRID); gz++) {
      const k = gx + ',' + gz;
      if (!bgrid.has(k)) bgrid.set(k, []);
      bgrid.get(k).push(idx);
    }
});
const inBuilding = (p) => (bgrid.get(Math.floor(p[0] / GRID) + ',' + Math.floor(p[1] / GRID)) || []).some((i) => pointInRing(p, bRings[i]));
// Keep trees off the paved plazas & water too
const blockers = areas.filter((a) => a[0] === 4 || a[0] === 5 || a[0] === 6).map((a) => { const r = []; for (let i = 1; i < a.length; i += 2) r.push([a[i] / 10, a[i + 1] / 10]); return r; });
const inBlocker = (p) => blockers.some((r) => pointInRing(p, r));

let seed = 12345;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const trees = [];
const addTree = (x, z, kind) => { if (inBox([x, z])) trees.push(q(x), q(z), kind); };
for (const n of nodes.values()) if (n.tags?.natural === 'tree') { const [x, z] = project(n.lat, n.lon); addTree(x, z, 0); }
// Fill green areas
const DENSITY = { 0: 1 / 140, 1: 1 / 700, 2: 1 / 55, 3: 1 / 260 }; // trees per m²
for (const a of areas) {
  if (DENSITY[a[0]] === undefined) continue;
  const ring = []; for (let i = 1; i < a.length; i += 2) ring.push([a[i] / 10, a[i + 1] / 10]);
  const ar = Math.abs(area(ring));
  if (ar > 2.5e6) continue;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const n = Math.min(6000, Math.round(ar * DENSITY[a[0]]));
  for (let k = 0; k < n; k++) {
    const p = [x0 + rand() * (x1 - x0), z0 + rand() * (z1 - z0)];
    if (pointInRing(p, ring) && !inBuilding(p) && !inBlocker(p)) addTree(p[0], p[1], a[0] === 2 ? 1 : rand() < 0.3 ? 1 : 0);
  }
}
// Street trees along the larger roads
for (const w of ways.values()) {
  const t = w.tags;
  if (!['primary', 'secondary', 'tertiary', 'trunk'].includes(t.highway) || t.tunnel || t.bridge) continue;
  const pts = wayPts(w);
  const half = ROAD[t.highway][1] * (t.name && BOULEVARDS.test(t.name) ? 1.25 : 1) / 2 + 2.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) continue;
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let s = 6; s < len - 3; s += 13) {
      for (const side of [-1, 1]) {
        if (rand() < 0.35) continue;
        const p = [ax + ((bx - ax) * s) / len + nx * half * side, az + ((bz - az) * s) / len + nz * half * side];
        if (!inBuilding(p)) addTree(p[0], p[1], 0);
      }
    }
  }
}

// ---------- write ----------
const write = async (name, obj) => {
  const s = JSON.stringify(obj);
  await fs.writeFile(path.join(OUT, name), s);
  console.log(`${name}: ${(s.length / 1e6).toFixed(2)} MB`);
};
await write('buildings.json', { classes: CLS, items: buildings });
await write('roads.json', { items: roads });
await write('areas.json', { items: areas });
await write('trees.json', { items: trees });
await write('landmarks.json', landmarks);
const tallest = buildings.slice().sort((a, b) => b[1] - a[1]).slice(0, 5).map((b) => b[1] / 10);
console.log(`${buildings.length} buildings (${mosques.length} mosques), ${roads.length} roads, ${areas.length} areas, ${trees.length / 3} trees; tallest ${tallest.join(', ')} m`);
