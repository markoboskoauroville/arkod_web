// GEO: the arithmetic of the map, ported from mantra_arkod Geo.kt. Pure: no DOM, so node --test runs it.

export const EARTH_R = 6371008.8;
export const MERC_LAT_LIMIT = 85.05112878;

export const rad = (deg) => deg * Math.PI / 180;
export const deg = (r) => r * 180 / Math.PI;

/** Metres between two points. */
export function distance(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export const clampLat = (lat) => Math.min(MERC_LAT_LIMIT, Math.max(-MERC_LAT_LIMIT, lat));

export function tileX(lon, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor((Math.min(180, Math.max(-180, lon)) + 180) / 360 * n);
  return Math.min(n - 1, Math.max(0, x));
}

export function tileY(lat, zoom) {
  const n = 2 ** zoom;
  const l = rad(clampLat(lat));
  const y = Math.floor((1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2 * n);
  return Math.min(n - 1, Math.max(0, y));
}

/** The west edge of tile column x at zoom, in degrees. */
export const tileLon = (x, zoom) => x / 2 ** zoom * 360 - 180;

/** The north edge of tile row y at zoom, in degrees. */
export function tileLat(y, zoom) {
  const n = Math.PI - 2 * Math.PI * y / 2 ** zoom;
  return deg(Math.atan(Math.sinh(n)));
}

const roundTo3 = (v) => Math.round(v * 1000) / 1000;

function padMinutes(m) {
  const whole = Math.floor(m);
  const thousandths = Math.round((m - whole) * 1000);
  return `${whole < 10 ? '0' : ''}${whole}.${String(thousandths).padStart(3, '0')}`;
}

function dm(value, hemisphere) {
  const a = Math.abs(value);
  let d = Math.floor(a);
  let m = (a - d) * 60;
  if (roundTo3(m) >= 60) { m = 0; d += 1; }
  return `${hemisphere} ${d} ${padMinutes(roundTo3(m))}`;
}

/** Degrees and decimal minutes, as a Croatian map and a rescue call speak them. */
export const formatLat = (lat) => dm(lat, lat >= 0 ? 'N' : 'S');
export const formatLon = (lon) => dm(lon, lon >= 0 ? 'E' : 'W');

export function formatRate(bytesPerSecond) {
  if (bytesPerSecond >= 1_000_000) return `${Math.floor(bytesPerSecond / 100_000) / 10} MB/s`;
  if (bytesPerSecond >= 1_000) return `${Math.floor(bytesPerSecond / 1_000)} kB/s`;
  return `${bytesPerSecond} B/s`;
}
