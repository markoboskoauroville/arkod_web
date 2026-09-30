// PARCEL CACHES: everything in the view, kept under a name. Ported from mantra_arkod ParcelCache.kt.
// A cache is the box that was on the screen, every parcel the WFS has in it with its outline and
// the point its number is written at, and what each parcel's sheets say. Inside the box the state's
// picture is taken away and these outlines are drawn instead. Pure.

import { fold, Source, hit as makeHit } from './finding.js';
import { parseParcels, contains, LineStyle, LINE_STYLES } from './parcels.js';
import { entriesOf, Role, ROLE_WORDS } from './ownerbook.js';
import { tileLat, tileLon } from './geo.js';

/** South, west, north, east, in degrees. */
export const box = (south, west, north, east) => ({ south, west, north, east });
export const boxContains = (b, lat, lon) => lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
export const boxIntersects = (b, o) => o.west < b.east && o.east > b.west && o.south < b.north && o.north > b.south;
export const boxHolds = (b, o) => o.west >= b.west && o.east <= b.east && o.south >= b.south && o.north <= b.north;
export const boxMiddle = (b) => [(b.south + b.north) / 2, (b.west + b.east) / 2];

export const holder = (name, role, detail) => ({ name, role, detail });

export function item({ id, number, reference, areaM2 = null, rings = [], label = null, municipalityName = '', address = '', uses = [], holders = [], read = false }) {
  return { id, number, reference, areaM2, rings, label, municipalityName, address, uses, holders, read };
}

export function itemBox(it) {
  const all = it.rings.flat();
  if (!all.length) return box(0, 0, 0, 0);
  return box(Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1])));
}

/** Where the map goes, and where the number is written: the state's own point if it gave one. */
export function itemMiddle(it) {
  if (it.label) return it.label;
  const r = it.rings[0];
  if (r && r.length) return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
  return [0, 0];
}

export const itemParcel = (it) => ({ id: it.id, number: it.number, reference: it.reference, areaM2: it.areaM2, rings: it.rings });

/** The quick picks for a cache: none is the state's ink, his parcels' amber, or the selection's cyan. */
export const COLOURS = [0xFFE040FB, 0xFF34D399, 0xFF60A5FA, 0xFFFACC15, 0xFFEF4444, 0xFFF2DDB4];

export function info({ id, name, createdMs, box: b, zoom, colour = COLOURS[0], style = LineStyle.SOLID, weight = 'NORMAL', visible = true, count = 0, read = 0, places = '' }) {
  return { id, name, createdMs, box: b, zoom, colour, style, weight, visible, count, read, places };
}

/** "Kukljica 30.9.2026", offered before he types his own. */
export function defaultName(places, day) {
  const first = (String(places).split(',')[0] ?? '').trim().toLowerCase();
  const it = first ? first[0].toUpperCase() + first.slice(1) : '';
  return it.trim() ? `${it} ${day}` : day;
}

/** The places a cache holds, most parcels first: "KUKLJICA, PRDKO". */
export function places(items) {
  const counts = new Map();
  for (const it of items) if (it.municipalityName.trim()) counts.set(it.municipalityName, (counts.get(it.municipalityName) ?? 0) + 1);
  return [...counts.entries()].map((e, i) => [e, i]).sort(([a, i], [b, j]) => b[1] - a[1] || i - j).map(([e]) => e[0]).join(', ');
}

function distinctBy(xs, f) {
  const seen = new Set();
  return xs.filter((x) => { const k = f(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** One parcel read: its sheets turned into what the search finds. */
export function itemOf(parcel, label, record, folios) {
  const holders = distinctBy(entriesOf(parcel, record, folios).map((e) => holder(e.name, e.role, e.detail)),
    (h) => fold(h.name) + '|' + h.role + '|' + h.detail);
  return item({
    id: parcel.id, number: parcel.number, reference: parcel.reference, areaM2: parcel.areaM2, rings: parcel.rings, label,
    municipalityName: record?.municipality ?? '', address: record?.address ?? '',
    uses: [...new Set((record?.uses ?? []).map((u) => u.name).filter((n) => n.trim()))],
    holders, read: record != null,
  });
}

function hit(it, inf, title, what) {
  const [lat, lon] = itemMiddle(it);
  return makeHit(String(it.id), title,
    [it.number !== title ? it.number : null, it.municipalityName.trim() ? `k.o. ${it.municipalityName}` : null, what, inf.name]
      .filter((x) => x != null).join(' · '),
    null, { lat, lon, source: Source.PARCEL, ref: it.reference });
}

/**
 * What he typed, over every cache on the device, with no signal at all: a name (any words, no
 * diacritics), "pl 1984", a number, or else an address or a land use.
 */
export function search(caches, query, limit = 40) {
  const q = fold(query).trim();
  if (q.length < 2 && !/^\d*$/.test(q)) return [];
  if (q === '') return [];
  const out = [];
  const sm = /^p\.?\s*l\.?\s*(\d+)$/.exec(q);
  const sheet = sm ? sm[1] : null;
  const number = /^\*?\d+(\/\d*)?$/.test(q);
  const words = q.split(/\s+/);
  outer:
  for (const cache of caches) for (const it of cache.items) {
    if (sheet != null) {
      if (it.holders.some((h) => h.role === Role.POSJEDNIK && h.detail === `p.l. ${sheet}`)) out.push(hit(it, cache.info, it.number, `p.l. ${sheet}`));
    } else if (number) {
      if (it.number.startsWith(q)) out.push(hit(it, cache.info, it.number, it.address.trim() ? it.address : null));
    } else {
      let found = false;
      for (const h of it.holders) {
        const n = fold(h.name);
        if (words.every((w) => n.includes(w))) { found = true; out.push(hit(it, cache.info, h.name, `${ROLE_WORDS[h.role]} · ${h.detail}`)); }
      }
      if (!found) {
        const rest = fold(it.address + ' ' + it.uses.join(' '));
        if (words.every((w) => rest.includes(w))) out.push(hit(it, cache.info, it.number, [it.address, it.uses.join(', ')].filter((x) => x.trim()).join(' · ')));
      }
    }
    if (out.length >= limit * 3) break outer;
  }
  const first = words[0];
  return distinctBy(out, (h) => h.title + '|' + h.ref + '|' + h.under)
    .map((h, i) => [h, i]).sort(([a, i], [b, j]) => {
      const sa = !fold(a.title).startsWith(first), sb = !fold(b.title).startsWith(first);
      if (sa !== sb) return sa ? 1 : -1;
      return a.title < b.title ? -1 : a.title > b.title ? 1 : i - j;
    }).map(([h]) => h).slice(0, limit);
}

/** The cached parcel under a finger, from the caches that are drawn. */
export function at(caches, lat, lon) {
  for (const c of caches) {
    if (!c.info.visible || !boxContains(c.info.box, lat, lon)) continue;
    for (const it of c.items) if (boxContains(itemBox(it), lat, lon) && it.rings.some((r) => contains(r, lat, lon))) return it;
  }
  return null;
}

export function byReference(caches, reference) {
  for (const c of caches) for (const it of c.items) if (it.reference === reference && it.rings.length) return it;
  return null;
}

// --- the map -------------------------------------------------------------------------------------

/** One slippy tile as a box in degrees. */
export const tileBox = (z, x, y) => box(tileLat(y + 1, z), tileLon(x, z), tileLat(y, z), tileLon(x + 1, z));

/** A point in the tile's pixels, size across, Web Mercator as the tile itself is. */
export function pixel(lat, lon, z, x, y, size) {
  const n = 2 ** z;
  const px = ((lon + 180) / 360 * n - x) * size;
  const r = lat * Math.PI / 180;
  const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n - y) * size;
  return [px, py];
}

/** The WFS box of the view, as its BBOX parameter wants it (latitude first in EPSG:4326). */
export const wfsBox = (b) => `${b.south},${b.west},${b.north},${b.east},urn:ogc:def:crs:EPSG::4326`;

/** The WFS answer's parcels with the point each number is written at. */
export function parseFeatures(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  const parcels = parseParcels(o);
  const features = Array.isArray(o?.features) ? o.features : null;
  if (!features) return parcels.map((p) => [p, null]);
  const points = new Map();
  for (const f of features) {
    const p = f?.properties;
    if (!p) continue;
    const tail = String(p.inspireId?.localId ?? '').split('.').pop();
    if (!/^-?\d+$/.test(tail)) continue;
    const c = p.referencePoint?.coordinates;
    if (!Array.isArray(c)) continue;
    points.set(Number(tail), [Number(c[1]), Number(c[0])]);
  }
  return parcels.map((p) => [p, points.get(p.id) ?? null]);
}

/** How many the WFS says there are in the box, when it says. */
export function matched(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  return o && 'numberMatched' in o ? Math.trunc(Number(o.numberMatched)) || 0 : null;
}

// --- on the device -------------------------------------------------------------------------------

const round6 = (v) => Math.round(v * 1e6) / 1e6;
const hex = (n) => Math.trunc(Number(n)).toString(16);

export function encodeInfo(i) {
  return JSON.stringify({
    id: i.id, name: i.name, created: i.createdMs, box: [i.box.south, i.box.west, i.box.north, i.box.east], zoom: i.zoom,
    colour: hex(i.colour), style: i.style, weight: i.weight, visible: i.visible, count: i.count, read: i.read, places: i.places,
  });
}

export function decodeInfo(text) {
  try {
    const o = JSON.parse(text);
    if (typeof o.id !== 'string' || !Array.isArray(o.box)) return null;
    const b = o.box.map(Number);
    return info({
      id: o.id, name: String(o.name ?? ''), createdMs: Number(o.created ?? 0), box: box(b[0], b[1], b[2], b[3]), zoom: Number(o.zoom ?? 0),
      colour: /^[0-9a-fA-F]+$/.test(String(o.colour ?? '')) ? parseInt(o.colour, 16) : COLOURS[0],
      style: LINE_STYLES.includes(o.style) ? o.style : LineStyle.SOLID,
      weight: ['FINE', 'NORMAL', 'BOLD'].includes(o.weight) ? o.weight : 'NORMAL',
      visible: o.visible !== false, count: Number(o.count ?? 0), read: Number(o.read ?? 0), places: String(o.places ?? ''),
    });
  } catch { return null; }
}

export function encodeItems(items) {
  return JSON.stringify(items.map((it) => {
    const o = { id: it.id, n: it.number, r: it.reference };
    if (it.areaM2 != null) o.a = it.areaM2;
    o.g = it.rings.map((ring) => ring.flatMap(([la, lo]) => [round6(la), round6(lo)]));
    if (it.label) o.l = [round6(it.label[0]), round6(it.label[1])];
    o.k = it.municipalityName; o.ad = it.address; o.u = it.uses;
    o.h = it.holders.map((h) => [h.name, h.role, h.detail]);
    o.ok = it.read;
    return o;
  }));
}

export function decodeItems(text) {
  try {
    const a = JSON.parse(text);
    if (!Array.isArray(a)) return [];
    return a.filter((o) => o && typeof o === 'object').map((o) => item({
      id: Number(o.id ?? 0), number: String(o.n ?? ''), reference: String(o.r ?? ''), areaM2: 'a' in o ? Number(o.a) : null,
      rings: (Array.isArray(o.g) ? o.g : []).filter(Array.isArray).map((r) => {
        const pts = [];
        for (let j = 0; j < Math.floor(r.length / 2); j++) pts.push([Number(r[2 * j]), Number(r[2 * j + 1])]);
        return pts;
      }),
      label: Array.isArray(o.l) ? [Number(o.l[0]), Number(o.l[1])] : null,
      municipalityName: String(o.k ?? ''), address: String(o.ad ?? ''),
      uses: (Array.isArray(o.u) ? o.u : []).map(String),
      holders: (Array.isArray(o.h) ? o.h : []).filter((x) => Array.isArray(x) && Object.values(Role).includes(x[1]))
        .map((x) => holder(String(x[0]), x[1], String(x[2] ?? ''))),
      read: o.ok === true,
    }));
  } catch { return []; }
}

// --- the job's status line (ParcelCaches.Progress.line) -----------------------------------------

export function progressLine(p) {
  let s = `cache "${p.name}": ${p.stage}`;
  if (p.total > 0) s += ` ${p.done}/${p.total}`;
  if (p.perSecond > 0.05 && !p.finished) s += ` · ${p.perSecond.toFixed(1)}/s`;
  if (p.perSecond > 0.05 && p.total > p.done && !p.finished) {
    const sec = Math.trunc((p.total - p.done) / p.perSecond);
    s += ` · ~${sec >= 90 ? `${Math.trunc((sec + 30) / 60)} min` : `${sec} s`} left`;
  }
  if (p.failed > 0) s += ` · ${p.failed} failed`;
  if (p.problem) s += ` · ${p.problem}`;
  return s;
}

/** The job's waits between tries of the failing WFS: 8 tries, about five minutes. */
export const TRIES = 8;
export const WAITS = [5, 10, 20, 30, 60, 60, 90];
export const PAGE = 500;
export const MAX_PARCELS = 15_000;
export const waitBefore = (attempt) => WAITS[Math.min(attempt - 1, WAITS.length - 1)];
