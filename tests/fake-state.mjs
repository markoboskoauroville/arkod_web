// A FAKE STATE FOR THE BROWSER TEST: the WMS, WFS and OSS answer as the real ones do, from one grid of
// 60 m squares (Web Mercator metres) laid over Kukljica, so the pictures, the taps, the outlines and
// the WFS all agree. The square under Kukljica's middle is 2449/2 (id 6434350). Every name is invented.

import { deflateSync } from 'node:zlib';

const R = 6378137;
const G = 60;
export const KUKLJICA = [44.036, 15.253];
const mx = (lon) => R * lon * Math.PI / 180;
const my = (lat) => R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const lonOf = (x) => x / R * 180 / Math.PI;
const latOf = (y) => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;
// the grid's origin puts Kukljica's middle in the middle of a square
const OX = mx(KUKLJICA[1]) - G / 2;
const OY = my(KUKLJICA[0]) - G / 2;

const cellAt = (lat, lon) => [Math.floor((mx(lon) - OX) / G), Math.floor((my(lat) - OY) / G)];
export function parcelOf(cx, cy) {
  if (cx === 0 && cy === 0) return { id: 6434350, number: '2449/2' };
  return { id: 6434350 + 1000 + (cx + 100) * 211 + (cy + 100), number: String(2449 + cx * 41 + cy) };
}
function cellByNumber(number) {
  if (number === '2449/2') return [0, 0];
  const n = Number(number) - 2449;
  for (let cx = -30; cx <= 30; cx++) { const cy = n - cx * 41; if (cy >= -20 && cy <= 20 && !(cx === 0 && cy === 0)) return [cx, cy]; }
  return null;
}
const ringOf = (cx, cy) => {
  const x0 = OX + cx * G, y0 = OY + cy * G;
  return [[x0, y0], [x0 + G, y0], [x0 + G, y0 + G], [x0, y0 + G], [x0, y0]].map(([x, y]) => [lonOf(x), latOf(y)]);
};

// --- PNG ---
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
export function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** The state's picture of a box in EPSG:3857: black lines 2 px wide on the grid, clear elsewhere. */
export function wmsPicture(bbox, w, h) {
  const [x0, y0, x1, y1] = bbox;
  const sx = (x1 - x0) / w, sy = (y1 - y0) / h;
  const near = (v, o, s) => { const d = ((v - o) % G + G) % G; return Math.min(d, G - d) < s; };
  return png(w, h, (px, py) => {
    const x = x0 + (px + 0.5) * sx, y = y1 - (py + 0.5) * sy;
    return near(x, OX, sx) || near(y, OY, sy) ? [20, 20, 20, 255] : [0, 0, 0, 0];
  });
}

export const osmTile = png(256, 256, (x, y) => ((x >> 5) + (y >> 5)) % 2 ? [226, 220, 205, 255] : [232, 227, 214, 255]);

const MUNI = { reg: '334723', name: 'KUKLJICA', id: '3347' };

export function info(params) {
  const layer = params.get('QUERY_LAYERS');
  const [s, w, n, e] = params.get('BBOX').split(',').map(Number);
  const lat = (s + n) / 2, lon = (w + e) / 2;
  if (layer === 'cp:CP.CadastralZoning') {
    // North of 45° is Zagreb's CENTAR NOVI, which has no such numbers (the screenshot of 30.9.2026).
    if (lat > 45) return `Results for FeatureType 'http://cp_wms:CP.CadastralZoning':\n--------------------------------------------\nID = 9\nLABEL = 335266-CENTAR NOVI\n--------------------------------------------`;
    return `Results for FeatureType 'http://cp_wms:CP.CadastralZoning':\n--------------------------------------------\nID = ${MUNI.id}\nLABEL = ${MUNI.reg}-${MUNI.name}\n--------------------------------------------`;
  }
  const [cx, cy] = cellAt(lat, lon);
  const p = parcelOf(cx, cy);
  return `Results for FeatureType 'http://cp_wms:CP.CadastralParcel':\n--------------------------------------------\nID = ${p.id}\nGEOMETRY = [GEOMETRY (Polygon) with 5 points]\nBROJ_CESTICE = ${p.number}\nMATICNI_BROJ_KO = ${MUNI.reg}\n--------------------------------------------`;
}

function feature(cx, cy) {
  const p = parcelOf(cx, cy);
  const ring = ringOf(cx, cy);
  const mid = [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2];
  return {
    type: 'Feature', id: `CP.${p.id}`, geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { areaValue: { value: 1850, '@uom': 'm2' }, inspireId: { localId: `CP.${p.id}`, namespace: 'HR.DGU.CP' },
      label: p.number, nationalCadastralReference: `${MUNI.reg}-${p.number}`, referencePoint: { type: 'Point', coordinates: mid } },
  };
}

export function wfs(params) {
  const cql = params.get('CQL_FILTER');
  if (cql) {
    const refs = [...cql.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const features = refs.map((r) => cellByNumber(r.split('-').slice(1).join('-'))).filter(Boolean).map(([cx, cy]) => feature(cx, cy));
    return JSON.stringify({ type: 'FeatureCollection', numberMatched: features.length, features });
  }
  const [s, w, n, e] = params.get('BBOX').split(',').map(Number);
  const [ax, ay] = cellAt(s, w), [bx, by] = cellAt(n, e);
  const all = [];
  for (let cx = ax; cx <= bx; cx++) for (let cy = ay; cy <= by; cy++) all.push([cx, cy]);
  const start = Number(params.get('STARTINDEX') ?? 0), count = Number(params.get('COUNT') ?? 500);
  return JSON.stringify({ type: 'FeatureCollection', numberMatched: all.length, features: all.slice(start, start + count).map(([cx, cy]) => feature(cx, cy)) });
}

function record(id) {
  const main = id === 6434350;
  let number = '2449/2';
  if (!main) { for (let cx = -30; cx <= 30 && number === '2449/2'; cx++) for (let cy = -30; cy <= 30; cy++) if (parcelOf(cx, cy).id === id) { number = parcelOf(cx, cy).number; break; } }
  return JSON.stringify({
    parcelId: id, parcelNumber: number, cadMunicipalityName: MUNI.name, cadMunicipalityRegNum: MUNI.reg, address: main ? 'DRAGE' : 'POLJE', area: main ? '1850' : '1790',
    parcelParts: main
      ? [{ name: 'MASLINIK', area: '1200', possessionSheetNumber: '1984' }, { name: 'PAŠNJAK', area: '650', possessionSheetNumber: '1984' }]
      : [{ name: 'ORANICA', area: '1790', possessionSheetNumber: '700' }],
    possessionSheets: main
      ? [{ possessionSheetNumber: '1984', possessors: [{ name: 'PRIMJER ANA', ownership: '1/2', address: 'Kukljica 1' }, { name: 'UZORAK IVO', ownership: '1/2', address: 'Zadar, Ulica 2' }] }]
      : [{ possessionSheetNumber: '700', possessors: [{ name: 'OGLEDNI MARKO', ownership: '1/1', address: 'Preko' }] }],
    lrUnitsFromParcelLinks: main ? [{ lrUnitNumber: '182', mainBookName: 'KUKLJICA', institutionName: 'Zemljišnoknjižni odjel Zadar', lrUnitTypeName: 'VLASNIČKI', mainBookId: 21400 }] : [],
  });
}

const folio = JSON.stringify([{
  lrUnitId: 9, lrUnitNumber: '182', mainBookId: 21400, mainBookName: 'KUKLJICA', institutionName: 'Zemljišnoknjižni odjel Zadar', lrUnitTypeName: 'VLASNIČKI', lastDiaryNumber: 'Z-1111/2025', activePlumbs: [],
  ownershipSheetB: { lrUnitShares: [
    { description: '1. Suvlasnički dio: 1/2', lrOwners: [{ name: 'PRIMJER ANA', address: 'Kukljica 1', lrEntry: { description: 'Zaprimljeno 02.02.2020.g. pod brojem Z-100/2020<br><br>UKNJIŽBA, PRAVO VLASNIŠTVA', orderNumber: '1.1' } }], subSharesAndEntries: [], orderNumber: '1' },
    { description: '2. Suvlasnički dio: 1/2', lrOwners: [{ name: 'UZORAK IVO', address: 'Zadar' }], subSharesAndEntries: [], orderNumber: '2' }], lrEntries: [] },
  possessionSheetA1: { lrParcels: [{ parcelNumber: '2449/2', address: 'DRAGE', area: '1850' }, { parcelNumber: '2450', address: 'DRAGE', area: '1790' }] },
  encumbranceSheetC: { lrEntryGroups: [] },
}]);

/** OSS: GET paths after /api/oss/, and the one POST search. */
export function oss(path, params, body) {
  if (path === 'cad/parcel-info') return record(Number(params.get('parcelId')));
  if (path === 'lr/lr-unit') return folio;
  if (path === 'search-cad-parcels/parcel-numbers') {
    const q = params.get('search') ?? '';
    if (params.get('municipalityRegNum') !== MUNI.reg) return JSON.stringify([]);
    const found = [];
    for (let cx = -3; cx <= 3; cx++) for (let cy = -3; cy <= 3; cy++) { const p = parcelOf(cx, cy); if (p.number.startsWith(q)) found.push({ key1: String(p.id), value1: p.number }); }
    return JSON.stringify(found.slice(0, 12));
  }
  if (path === 'cad/search-parcels') return JSON.stringify([]);
  return null;
}
