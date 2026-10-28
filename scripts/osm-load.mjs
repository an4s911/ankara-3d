// Minimal OSM XML loader for the cached /map tiles. Merges all tiles into
// de-duplicated node / way / relation maps.
import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE = path.resolve('.cache/osm');

const attr = (s, k) => {
  const m = s.match(new RegExp(`\\b${k}="([^"]*)"`));
  return m ? m[1] : undefined;
};
const unescape = (s) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function parseTags(body) {
  const tags = {};
  for (const m of body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g)) tags[unescape(m[1])] = unescape(m[2]);
  return tags;
}

export async function loadOSM() {
  const files = JSON.parse(await fs.readFile(path.join(CACHE, 'index.json'), 'utf8'));
  const nodes = new Map(); // id -> {lat, lon, tags?}
  const ways = new Map(); // id -> {nodes:[ids], tags}
  const relations = new Map(); // id -> {members:[{type,ref,role}], tags}

  for (const file of files) {
    const xml = await fs.readFile(file, 'utf8');
    // Self-closing nodes (no tags)
    for (const m of xml.matchAll(/<node ([^>]*?)\/>/g)) {
      const id = attr(m[1], 'id');
      if (!nodes.has(id)) nodes.set(id, { lat: +attr(m[1], 'lat'), lon: +attr(m[1], 'lon') });
    }
    // Nodes with tags
    for (const m of xml.matchAll(/<node ([^>]*?[^/])>([\s\S]*?)<\/node>/g)) {
      const id = attr(m[1], 'id');
      nodes.set(id, { lat: +attr(m[1], 'lat'), lon: +attr(m[1], 'lon'), tags: parseTags(m[2]) });
    }
    for (const m of xml.matchAll(/<way ([^>]*)>([\s\S]*?)<\/way>/g)) {
      const id = attr(m[1], 'id');
      if (ways.has(id)) continue;
      const nds = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map((x) => x[1]);
      ways.set(id, { id, nodes: nds, tags: parseTags(m[2]) });
    }
    for (const m of xml.matchAll(/<relation ([^>]*)>([\s\S]*?)<\/relation>/g)) {
      const id = attr(m[1], 'id');
      if (relations.has(id)) continue;
      const members = [...m[2].matchAll(/<member type="(\w+)" ref="(\d+)" role="([^"]*)"\/>/g)].map((x) => ({
        type: x[1], ref: x[2], role: x[3],
      }));
      relations.set(id, { id, members, tags: parseTags(m[2]) });
    }
  }
  return { nodes, ways, relations };
}
