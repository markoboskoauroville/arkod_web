// MOJE ČESTICE AS A FILE, AND THE GROUPS A FILE MAKES. Ported from mantra_arkod MarkFile.kt, the
// reference: the same .arkod.json, read and written the same way, so a file made on an Android
// phone opens here and the other way round. Pure.

import { SWATCHES, LineStyle, LINE_STYLES, mark } from './parcels.js';

export const SUFFIX = '.arkod.json';
export const KIND = 'arkod-moje-cestice';
const WEIGHTS = ['FINE', 'NORMAL', 'BOLD'];

export const group = (name, colour = SWATCHES[0], style = LineStyle.DASHED, weight = 'NORMAL', visible = true) =>
  ({ name, colour, style, weight, visible });

/** "Obitelj Boško.arkod.json" is the group "Obitelj Boško". */
export function nameFrom(fileName) {
  if (fileName == null) return null;
  let n = String(fileName).trim();
  for (const s of [SUFFIX, '.json', '.arkod']) if (n.endsWith(s)) n = n.slice(0, -s.length);
  n = n.trim();
  return n ? n : null;
}

/** A name a file can carry on any phone: no slashes, colons or other separators. */
export function fileName(g) {
  const base = (String(g).trim() ? g : 'Moje čestice').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').trim();
  return (base || 'Moje čestice') + SUFFIX;
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;
const hex = (n) => Math.trunc(Number(n)).toString(16);

export function encode(g, marks) {
  const o = {
    kind: KIND, version: 1, app: 'ARKOD Layer', name: g.name, colour: hex(g.colour), style: g.style, weight: g.weight,
    parcels: marks.map((m) => {
      const p = { ref: m.reference, number: m.number, id: m.id };
      if (m.name && m.name.trim()) p.name = m.name;
      p.rings = m.rings.map((ring) => ring.flatMap(([la, lo]) => [round6(la), round6(lo)]));
      return p;
    }),
  };
  return JSON.stringify(o, null, 1);
}

/** A file, read; null when it is not one of ours or holds no parcel. */
export function decode(text, fileNameGiven) {
  let o;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object' || o.kind !== KIND) return null;
  const name = nameFrom(fileNameGiven) ?? (String(o.name ?? '').trim() ? String(o.name) : 'Uvezeno');
  const colour = /^[0-9a-fA-F]+$/.test(String(o.colour ?? '')) ? parseInt(o.colour, 16) : SWATCHES[0];
  const g = group(name, colour, LINE_STYLES.includes(o.style) ? o.style : LineStyle.DASHED, WEIGHTS.includes(o.weight) ? o.weight : 'NORMAL');
  const seen = new Set();
  const marks = (Array.isArray(o.parcels) ? o.parcels : []).map((p) => {
    if (!p || typeof p !== 'object') return null;
    const ref = String(p.ref ?? '');
    if (!ref.includes('-')) return null;
    const rings = (Array.isArray(p.rings) ? p.rings : []).map((r) => {
      if (!Array.isArray(r)) return null;
      const pts = [];
      for (let j = 0; j < Math.floor(r.length / 2); j++) pts.push([Number(r[2 * j]), Number(r[2 * j + 1])]);
      return pts.length >= 3 ? pts : null;
    }).filter(Boolean);
    const number = String(p.number ?? '').trim() ? String(p.number) : ref.slice(ref.indexOf('-') + 1);
    const id = Number.isFinite(Number(p.id)) ? Math.trunc(Number(p.id)) : 0;
    return mark(ref, number, g.colour, rings, id, g.style, String(p.name ?? ''), g.name, g.weight);
  }).filter((m) => m && !seen.has(m.reference) && seen.add(m.reference));
  return marks.length ? { group: g, marks } : null;
}

/** A file opened: its group replaces one of the same name; a parcel kept elsewhere moves to it. */
export function importInto(marks, groups, read) {
  const refs = new Set(read.marks.map((m) => m.reference));
  const kept = marks.filter((m) => m.group !== read.group.name && !refs.has(m.reference));
  return [[...kept, ...read.marks], [...groups.filter((g) => g.name !== read.group.name), read.group]];
}

/** A group restyled: every one of its parcels takes the group's colour, line and weight. */
export const restyle = (marks, g) => marks.map((m) => (m.group === g.name ? { ...m, colour: g.colour, style: g.style, weight: g.weight } : m));

/** The group a name is, or a new one in the look its parcels already have. */
export function groupOf(name, groups, marks) {
  const g = groups.find((x) => x.name === name);
  if (g) return g;
  const m = marks.find((x) => x.group === name);
  return m ? group(name, m.colour, m.style, m.weight) : group(name);
}

/** Every group that has parcels, his own (no name) first, then the files in the order they came. */
export function groupsIn(marks, groups) {
  const names = [...new Set(marks.map((m) => m.group))];
  const ordered = [...names.filter((n) => !n.trim()), ...names.filter((n) => n.trim())];
  return ordered.map((n) => groupOf(n, groups, marks));
}

export const encodeGroups = (groups) => JSON.stringify(groups.map((g) => ({ name: g.name, colour: hex(g.colour), style: g.style, weight: g.weight, visible: g.visible })));

export function decodeGroups(text) {
  try {
    const a = JSON.parse(text ?? '[]');
    return (Array.isArray(a) ? a : []).filter((o) => o && typeof o === 'object').map((o) => group(
      String(o.name ?? ''),
      /^[0-9a-fA-F]+$/.test(String(o.colour ?? '')) ? parseInt(o.colour, 16) : SWATCHES[0],
      LINE_STYLES.includes(o.style) ? o.style : LineStyle.DASHED,
      WEIGHTS.includes(o.weight) ? o.weight : 'NORMAL',
      o.visible !== false,
    ));
  } catch { return []; }
}
