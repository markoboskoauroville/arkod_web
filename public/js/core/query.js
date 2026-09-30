// WHAT HE TYPED INTO THE PARCEL FIELD, AND WHERE TO LOOK FOR IT (Android v11, ParcelQuery.kt).
// A number is found in Moje čestice in every k.o., in the k.o. he names with it ("1358/3 kukljica"),
// and, when the k.o. under the map has no such number, in every k.o. already known on the device.

import { fold } from './finding.js';
import { hit, Source } from './finding.js';

export const ko = (reg, name, id = '') => ({ reg, name, id });
export const label = (k) => (k.name && k.name.trim() ? k.name : k.reg);

const NUMBER = /^\*?\d+(\/\d*)?$/;

/** "1358/3 kukljica" → {number:"1358/3", place:"kukljica"}; null without exactly one number. */
export function parse(text) {
  const words = String(text).trim().split(/[\s,;]+/).filter(Boolean);
  const numbers = words.filter((w) => NUMBER.test(w));
  if (numbers.length !== 1) return null;
  const rest = words.filter((w) => w !== numbers[0])
    .filter((w) => !['k.o', 'ko', 'k', 'o'].includes(fold(w).replace(/\.+$/, '')))
    .join(' ').trim();
  return { number: numbers[0], place: rest || null };
}

/** Every k.o. the device knows, each once: seen, Imenik, caches, Moje čestice (a mark has no name). */
export function known(seen, marks, caches, book) {
  const all = [...seen];
  for (const e of book) { const r = String(e.reference).split('-')[0]; if (r && e.reference.includes('-')) all.push(ko(r, e.municipalityName ?? '')); }
  for (const c of caches) for (const i of c.items) { const r = String(i.reference).split('-')[0]; if (r && i.reference.includes('-')) all.push(ko(r, i.municipalityName ?? '')); }
  for (const m of marks) { const r = String(m.reference).split('-')[0]; if (r && m.reference.includes('-')) all.push(ko(r, '')); }
  const out = new Map();
  for (const k of all) {
    const had = out.get(k.reg);
    out.set(k.reg, had ? { ...had, name: had.name || k.name, id: had.id || k.id } : k);
  }
  return [...out.values()];
}

/** The k.o. he named: its number, its exact name, or the one name that starts so; else null. */
export function resolve(place, knownList) {
  const p = fold(place).trim();
  if (!p) return null;
  const byReg = knownList.find((k) => k.reg === p);
  if (byReg) return byReg;
  const exact = knownList.find((k) => fold(k.name) === p);
  if (exact) return exact;
  const starts = knownList.filter((k) => k.name && fold(k.name).startsWith(p));
  return starts.length === 1 ? starts[0] : null;
}

/** Moje čestice whose number begins with it, every k.o. (or only [only]); the exact one first. */
export function mine(marks, number, knownList, only = null) {
  const names = new Map(knownList.map((k) => [k.reg, label(k)]));
  return marks
    .filter((m) => m.number.startsWith(number) && (!only || m.reference.split('-')[0] === only.reg))
    .map((m, i) => [m, i]).sort(([a, i], [b, j]) => (a.number === number ? 0 : 1) - (b.number === number ? 0 : 1) || i - j).map(([m]) => m)
    .map((m) => hit(String(m.id), m.number,
      ['Moje čestice', m.name || null, `k.o. ${names.get(m.reference.split('-')[0]) ?? m.reference.split('-')[0]}`].filter(Boolean).join(' · '),
      null, { source: Source.PARCEL, ref: m.reference }));
}

const numberOf = (h) => (h.ref ? h.ref.slice(h.ref.indexOf('-') + 1) : null);

/** What Search opens: the one exact number; a single result of any kind; else null (a choice). */
export function best(hits, number) {
  const exact = [...new Map(hits.filter((h) => numberOf(h) === number).map((h) => [h.ref, h])).values()];
  if (exact.length === 1) return exact[0];
  if (!exact.length && new Set(hits.map((h) => h.ref)).size === 1) return hits[0];
  return null;
}

export const hasExact = (hits, number) => hits.some((h) => numberOf(h) === number);

export const withSeen = (list, k) => [k, ...list.filter((x) => x.reg !== k.reg)].slice(0, 30);
