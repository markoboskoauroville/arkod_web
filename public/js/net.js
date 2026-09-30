// THE NETWORK: the state's three services through this site's proxies, and Google with the user's
// own key. Every function answers or throws an Error whose message is a sentence to show.

import * as P from './core/parcels.js';
import * as Cache from './core/cache.js';
import { parcelAt, box as outlineBox } from './core/outline.js';
import { merge, withoutHouseLetter, Source, hit } from './core/finding.js';
import { distance } from './core/geo.js';

export const API = { wms: '/api/wms', wfs: '/api/wfs', oss: '/api/oss' };

async function text(url, init) {
  let r;
  try { r = await fetch(url, init); } catch { throw new Error('nema signala ili država ne odgovara'); }
  const t = await r.text();
  if (!r.ok) throw new Error(P.stateReason(t) ?? `država je odgovorila ${r.status}`);
  return { text: t, keptAt: r.headers.get('X-Kept-At') };
}

/** The parcel under a point: id, number, municipality (GetFeatureInfo, a fifth of a second). */
export async function parcelAt_(lat, lon) {
  const { text: t } = await text(P.infoUrl(lat, lon, 'cp:CP.CadastralParcel', API.wms));
  return P.parcelFromInfo(t);
}
export { parcelAt_ as parcelUnder };

/** The cadastral municipality under a point: {reg, name, id}. */
export async function municipalityAt(lat, lon) {
  const { text: t } = await text(P.infoUrl(lat, lon, 'cp:CP.CadastralZoning', API.wms));
  const z = P.zoningFromInfo(t);
  if (!z) return null;
  return { reg: z[0], name: z[1], id: P.zoningIdFromInfo(t) };
}

/** A picture of the state's lines, as a canvas-readable bitmap. */
async function picture(url) {
  let r;
  try { r = await fetch(url); } catch { throw new Error('nema signala'); }
  if (!r.ok) throw new Error(`država je odgovorila ${r.status}`);
  return createImageBitmap(await r.blob());
}

/**
 * THE OUTLINE AT ONCE, READ OFF THE STATE'S PICTURE (Outline.kt): 300 m of ground round the finger,
 * then 900, then 2700, until the parcel fits. Null when even that does not hold it.
 */
export async function outline(lat, lon) {
  for (const side of [300, 900, 2700]) {
    const b = outlineBox(lat, lon, side);
    const px = 1024;
    const url = `${API.wms}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=cp:CP.CadastralParcel&STYLES=` +
      `&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=${px}&HEIGHT=${px}&BBOX=${b[0]},${b[1]},${b[2]},${b[3]}`;
    const bmp = await picture(url);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const data = g.getImageData(0, 0, bmp.width, bmp.height).data;
    const wall = new Uint8Array(bmp.width * bmp.height);
    for (let i = 0; i < wall.length; i++) wall[i] = data[i * 4 + 3] >= 60 ? 1 : 0;
    const ring = parcelAt(wall, bmp.width, bmp.height, b, lat, lon);
    if (ring) return [ring];
  }
  return null;
}

/** The possession sheet and what it says; keptAt when it came off the device with no signal. */
export async function record(parcelId) {
  const { text: t, keptAt } = await text(P.recordUrl(parcelId, API.oss));
  return { record: P.parseRecord(t), keptAt };
}

export async function folio(bookId, unit) {
  try {
    const { text: t } = await text(P.folioUrl(bookId, unit, API.oss));
    return P.parseFolio(t);
  } catch { return null; }
}

/** Every owner sheet the cadastre's record links to, each once. */
export async function ownerSheets(rec) {
  const seen = new Set();
  const wanted = rec.landBooks.filter((b) => b.bookId && b.unit && !seen.has(b.bookId + '|' + b.unit) && seen.add(b.bookId + '|' + b.unit));
  return (await Promise.all(wanted.map((b) => folio(b.bookId, b.unit)))).filter(Boolean);
}

/** Where the state has no link: the land book by the municipality's name, then the number typed. */
export async function findOwnerSheets(municipality, number, isFolio) {
  const { text: t } = await text(P.booksUrl(municipality, API.oss));
  const books = P.parseBooks(t, municipality);
  if (!books.length) throw new Error(`nema zemljišne knjige imena ${municipality}`);
  for (const book of books) {
    let units = [];
    if (isFolio) units = [number];
    else {
      try { units = P.parseFolioNumbers((await text(P.foliosByParcelUrl(book.id, number, API.oss))).text); } catch { units = []; }
    }
    const found = (await Promise.all([...new Set(units)].map((u) => folio(book.id, u)))).filter(Boolean);
    if (found.length) return found.map((f) => ({ ...f, bookId: book.id }));
  }
  return [];
}

/** OSS's own search: a number or a possession sheet, inside one municipality (its internal id). */
export async function ossSearch(municipalityId, number = null, sheet = null) {
  const { text: t } = await text(`${API.oss}/cad/search-parcels`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: P.searchBody(municipalityId, number, sheet),
  });
  return P.parseSearch(t);
}

/** Numbers as he types them, from OSS: a tenth of a second. */
export async function suggestions(number, muni) {
  const { text: t } = await text(P.searchUrl(number, muni.reg, API.oss));
  return P.parseSuggestions(t, muni.reg, muni.name);
}

/** The id of exactly that number in a municipality. */
export async function idOf(number, muniReg) {
  const { text: t } = await text(P.searchUrl(number, muniReg, API.oss));
  return P.parseSearchId(t, number);
}

/**
 * THE SHAPES, WHICH ONLY THE SLOW SERVICE HAS: the WFS by reference. It fails in spells, so it is
 * tried again [tries] times, waiting as the cache job waits, and the state's own reason is kept.
 */
export async function shapes(references, { tries = 3, onWait = null, signal = null } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const { text: t } = await text(P.byReferenceUrl(references, API.wfs), { signal });
      return P.parseParcels(t);
    } catch (e) {
      last = e;
      if (attempt === tries || signal?.aborted) break;
      const wait = Cache.waitBefore(attempt);
      onWait?.(wait, attempt + 1, tries, e.message);
      await sleep(wait * 1000, signal);
    }
  }
  throw last ?? new Error('država nije odgovorila');
}

/** One page of every parcel in a box, with their number points. */
export async function boxPage(b, start, signal) {
  const { text: t } = await text(P.boxPageUrl(b, start, Cache.PAGE, API.wfs), { signal });
  return { features: Cache.parseFeatures(t), matched: Cache.matched(t) };
}

/** The raw answer of one OSS GET, for the cache job, which keeps it. */
export const ossText = async (url) => (await text(url)).text;

export const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('stopped')); }, { once: true });
});

// --- Google, with the user's own key -------------------------------------------------------------

const sessions = new Map();

/** A Map Tiles session for a view; kept six hours. Google's own words when it refuses. */
export async function googleSession(view, key) {
  const k = view + '|' + key.slice(-6);
  const c = sessions.get(k);
  if (c && Date.now() - c.at < 6 * 3600 * 1000) return c.token;
  const types = { roadmap: 'roadmap', satellite: 'satellite', terrain: 'terrain', hybrid: 'satellite' };
  const body = { mapType: types[view] ?? 'roadmap', language: 'hr', region: 'HR' };
  if (view === 'hybrid' || view === 'terrain') body.layerTypes = ['layerRoadmap'];
  let r;
  try {
    r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch { throw new Error('Google is out of reach (no signal?)'); }
  const t = await r.text();
  if (!r.ok) {
    let said = null;
    try { said = JSON.parse(t).error?.message; } catch { /* not JSON */ }
    throw new Error(said ? `Google: ${said}` : `Google answered ${r.status}`);
  }
  const token = JSON.parse(t).session;
  if (!token) throw new Error('Google gave no session');
  sessions.set(k, { token, at: Date.now() });
  return token;
}

export const forgetGoogle = () => sessions.clear();

export const googleTileUrl = (session, key) =>
  `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`;

async function places(url, key, body, fields) {
  const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key };
  if (fields) headers['X-Goog-FieldMask'] = fields;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) {
    let said = null;
    try { said = JSON.parse(t).error?.message; } catch { /* not JSON */ }
    throw new Error(`Google: ${said ?? r.status}`);
  }
  return JSON.parse(t);
}

function bias(from) {
  return from ? { circle: { center: { latitude: from[0], longitude: from[1] }, radius: 50_000 } } : undefined;
}

async function autocomplete(textIn, key, from, session) {
  const body = { input: textIn, languageCode: 'hr', includedRegionCodes: ['hr'], sessionToken: session };
  if (from) { body.origin = { latitude: from[0], longitude: from[1] }; body.locationBias = bias(from); }
  const a = (await places('https://places.googleapis.com/v1/places:autocomplete', key, body)).suggestions ?? [];
  return a.map((s) => s.placePrediction).filter(Boolean).map((p) => hit(p.placeId,
    p.structuredFormat?.mainText?.text ?? p.text?.text ?? '', p.structuredFormat?.secondaryText?.text ?? '',
    typeof p.distanceMeters === 'number' ? p.distanceMeters : null));
}

async function textSearch(textIn, key, from) {
  const body = { textQuery: textIn, pageSize: 10, languageCode: 'hr', regionCode: 'hr' };
  if (from) body.locationBias = bias(from);
  const a = (await places('https://places.googleapis.com/v1/places:searchText', key, body,
    'places.id,places.displayName,places.formattedAddress,places.location')).places ?? [];
  return a.filter((p) => p.location).map((p) => hit(p.id, p.displayName?.text ?? '', p.formattedAddress ?? '',
    from ? Math.trunc(distance(from[0], from[1], p.location.latitude, p.location.longitude)) : null,
    { lat: p.location.latitude, lon: p.location.longitude }));
}

/** Everything Google has for the words, nearest first (PlaceSearch.find). */
export async function googleFind(textIn, from, key, session, full = true) {
  const tries = [autocomplete(textIn, key, from, session)];
  const plain = withoutHouseLetter(textIn);
  if (plain) tries.push(autocomplete(plain, key, from, session));
  if (full) tries.push(textSearch(textIn, key, from));
  const got = await Promise.allSettled(tries);
  const lists = got.filter((g) => g.status === 'fulfilled').map((g) => g.value);
  const merged = merge(lists);
  const problem = got.find((g) => g.status === 'rejected')?.reason?.message ?? null;
  return { hits: merged, problem: merged.length ? null : (problem ?? 'ništa nije pronađeno') };
}

/** Where a prediction is, asked once it is tapped. */
export async function googleLocate(h, key, session) {
  if (h.lat != null && h.lon != null) return h;
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(h.id)}?sessionToken=${encodeURIComponent(session)}`,
    { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'location' } });
  if (!r.ok) return null;
  const loc = (await r.json()).location;
  return loc ? { ...h, lat: loc.latitude, lon: loc.longitude } : null;
}

export { Source };
