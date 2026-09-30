// THE SNIFFER'S DECISIONS AND FLY-THROUGH'S WORDS (Android v12, v13, v16: Sniff.kt).

import { fold } from './finding.js';

const SPLIT = /[^a-z0-9*/]+/;

/** His keywords: one criterion per comma, semicolon or line; each of one or more folded words. */
export const criteria = (text) => String(text ?? '').split(/[,;\n]/)
  .map((c) => fold(c).split(SPLIT).filter(Boolean)).filter((c) => c.length);

/** Every word a sheet says: holders, owners, the place, the land uses, the k.o. */
export function wordsOf(record, folios = []) {
  const out = [];
  if (record) {
    for (const s of record.sheets) for (const o of s.owners) out.push(o.name);
    out.push(record.address);
    for (const u of record.uses) out.push(u.name);
    out.push(record.municipality);
  }
  for (const f of folios) for (const s of f.shares) for (const o of s.owners) out.push(o.name);
  return out.filter((t) => t && String(t).trim());
}

/** A criterion fits when each of its words begins a word of one text; no criteria: everything fits. */
export function fits(texts, crit) {
  if (!crit.length) return true;
  const lines = texts.map((t) => fold(t).split(SPLIT).filter(Boolean));
  return crit.some((words) => lines.some((line) => words.every((w) => line.some((x) => x.startsWith(w)))));
}

/** An n x n grid over the box, the middle first. */
export function grid(south, west, north, east, n = 5) {
  const mid = [(south + north) / 2, (west + east) / 2];
  const pts = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pts.push([south + (north - south) * (i + 0.5) / n, west + (east - west) * (j + 0.5) / n]);
  return pts.sort((a, b) => ((a[0] - mid[0]) ** 2 + (a[1] - mid[1]) ** 2) - ((b[0] - mid[0]) ** 2 + (b[1] - mid[1]) ** 2));
}

export function line(t, crit) {
  return [t.busy ? 'cache: reading' : 'cache', `${t.read} read`, `${t.kept} kept`,
    t.skipped > 0 ? `${t.skipped} not fitting` : null, t.failed > 0 ? `${t.failed} failed` : null,
    crit.length ? 'keywords: ' + crit.map((c) => c.join(' ')).join(', ') : null].filter(Boolean).join(' · ');
}

export function megabytes(bytes) {
  if (bytes < 1_000_000) return `${Math.ceil(bytes / 1000)} kB`;
  if (bytes < 10_000_000_000) return `${(bytes / 1_000_000).toFixed(1).replace(/\.0$/, '')} MB`;
  return `${Math.floor(bytes / 1_000_000_000)} GB`;
}

// --- every kept parcel in three words (v13) -------------------------------------------------------

const NOT_NAMES = new Set(['pok', 'ud', 'r', 'rod', 'zv', 'p', 'z', 'sin', 'kci', 'zena', 'i', 'dr']);
const nameWords = (name) => fold(name).split(/[^a-z]+/).filter((w) => w.length > 1 && !NOT_NAMES.has(w));
const title = (w) => w.toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Number, surname (the word the kept sheets use most), place, k.o.; by k.o., then number. */
export function kept(records) {
  const counts = new Map();
  for (const r of records) for (const s of r.sheets) for (const o of s.owners) for (const w of new Set(nameWords(o.name))) counts.set(w, (counts.get(w) ?? 0) + 1);
  const key = (n) => n.replace(/^\*/, '').split('/').map((x) => x.padStart(6, '0')).join('/');
  return records.map((r) => {
    const first = r.sheets.flatMap((s) => s.owners)[0];
    let surname = '';
    if (first) {
      const words = nameWords(first.name);
      const w = words.reduce((a, b) => ((counts.get(b) ?? 0) > (counts.get(a) ?? 0) ? b : a), words[0]);
      if (w) surname = title(first.name.split(/[\s,.]+/).find((x) => fold(x) === w) ?? w);
    }
    return { number: r.number, municipalityReg: r.municipalityNumber, municipality: r.municipality, place: r.address, surname };
  }).sort((a, b) => a.municipality.localeCompare(b.municipality) || key(a.number).localeCompare(key(b.number)));
}

export const keptWords = (k) => [k.surname, k.place ? title(k.place) : '', k.municipality].filter(Boolean).join(' · ');

export function filterKept(list, text) {
  const q = fold(text).trim();
  if (!q) return list;
  return list.filter((k) => fold(`${k.number} ${k.surname} ${k.place} ${k.municipality}`).includes(q));
}

// --- fly-through scanning (v16) ---------------------------------------------------------------------

export const Stage = Object.freeze({ WAITING: 'WAITING', ZOOM: 'ZOOM', SCANNING: 'SCANNING', DONE: 'DONE' });

export const flyState = (o = {}) => ({ query: '', on: false, stage: Stage.WAITING, asked: 0, total: 0, read: 0, found: [], selecting: null, problem: null, ...o });

/** The text on a sheet that fits what he wrote, or null. */
export function why(record, folios, crit) {
  if (!crit.length) return null;
  return wordsOf(record, folios).find((t) => fits([t], crit))?.trim() ?? null;
}

export function flyLine(s) {
  const q = `✈ "${s.query}"`;
  const found = s.found.length ? ` · found ${s.found.length}` : '';
  const trouble = s.problem ? ` · ${s.problem}` : '';
  switch (s.stage) {
    case Stage.ZOOM: return `${q}: zoom to 16 or closer to scan${found}${trouble}`;
    case Stage.SCANNING: return s.selecting ? `${q}: found ${s.selecting} · selecting${found}${trouble}`
      : `${q}: scanning ${s.asked}/${s.total} · ${s.read} sheets read${found}${trouble}`;
    case Stage.DONE: return `${q}: this view scanned · ${s.read} sheets read${found} · move on${trouble}`;
    default: return `${q}: fly over the map, it scans where it rests${found}${trouble}`;
  }
}
