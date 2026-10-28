// Downloads raw OpenStreetMap data for OSM_BBOX from the OSM API (/api/0.6/map)
// in small tiles, cached under .cache/osm. Tiles that exceed the API's node
// limit are split into quarters automatically.
import fs from 'node:fs/promises';
import path from 'node:path';
import { OSM_BBOX } from '../src/config.js';

const CACHE = path.resolve('.cache/osm');
const STEP = 0.01;

async function fetchTile(w, s, e, n, depth = 0) {
  const name = [w, s, e, n].map((v) => v.toFixed(5)).join('_');
  const file = path.join(CACHE, `${name}.osm`);
  try {
    await fs.access(file);
    return [file];
  } catch {}
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${w},${s},${e},${n}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'ankara-3d-demo/1.0 (static data bake)' } });
    if (res.ok) {
      await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
      return [file];
    }
    if (res.status === 400 && depth < 3) {
      // Too many nodes — split into four.
      const mx = (w + e) / 2, my = (s + n) / 2;
      const parts = await Promise.all([
        fetchTile(w, s, mx, my, depth + 1), fetchTile(mx, s, e, my, depth + 1),
        fetchTile(w, my, mx, n, depth + 1), fetchTile(mx, my, e, n, depth + 1),
      ]);
      return parts.flat();
    }
    console.warn(`  ${url} -> HTTP ${res.status}, retrying`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error(`failed: ${url}`);
}

await fs.mkdir(CACHE, { recursive: true });
const jobs = [];
for (let w = OSM_BBOX.west; w < OSM_BBOX.east - 1e-9; w += STEP) {
  for (let s = OSM_BBOX.south; s < OSM_BBOX.north - 1e-9; s += STEP) {
    jobs.push([w, s, Math.min(w + STEP, OSM_BBOX.east), Math.min(s + STEP, OSM_BBOX.north)]);
  }
}
const files = [];
let done = 0;
// A couple of concurrent requests keeps us polite to the OSM API.
const queue = [...jobs];
await Promise.all(
  [0, 1].map(async () => {
    while (queue.length) {
      const job = queue.shift();
      files.push(...(await fetchTile(...job)));
      process.stdout.write(`\r  tiles ${++done}/${jobs.length}`);
    }
  }),
);
await fs.writeFile(path.join(CACHE, 'index.json'), JSON.stringify(files));
console.log(`\nfetched ${files.length} OSM tile files`);
