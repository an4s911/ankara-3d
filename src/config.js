// Shared configuration — imported by both the app and the Node data scripts,
// so keep this file free of three.js / DOM dependencies.

// Local tangent-plane origin: Kızılay Square.
export const ORIGIN = { lat: 39.9208, lon: 32.8541 };

const R = 6378137;
const RAD = Math.PI / 180;
const M_PER_DEG_LAT = R * RAD;
const M_PER_DEG_LON = R * RAD * Math.cos(ORIGIN.lat * RAD);

// +X east, +Z south (so -Z is north), metres.
export function project(lat, lon) {
  return [(lon - ORIGIN.lon) * M_PER_DEG_LON, -(lat - ORIGIN.lat) * M_PER_DEG_LAT];
}
export function unproject(x, z) {
  return [ORIGIN.lat - z / M_PER_DEG_LAT, ORIGIN.lon + x / M_PER_DEG_LON];
}

// Area for which OSM buildings/roads are fetched.
export const OSM_BBOX = { south: 39.878, west: 32.818, north: 39.950, east: 32.885 };

// High-resolution terrain covering the city (metres, local frame).
export const TERRAIN = { minX: -3300, maxX: 3000, minZ: -3500, maxZ: 4900, step: 10 };
// Low-resolution terrain reaching to the horizon.
export const OUTER_TERRAIN = { minX: -24000, maxX: 24000, minZ: -24000, maxZ: 24000, step: 150 };
