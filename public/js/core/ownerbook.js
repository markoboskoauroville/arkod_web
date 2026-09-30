// IMENIK: who holds what, from every sheet this device has read. Ported from mantra_arkod
// OwnerBook.kt. The state publishes no search by a person's name, so the book is made here. Pure.

import { fold, Source, hit as makeHit } from './finding.js';

export const Role = Object.freeze({ POSJEDNIK: 'POSJEDNIK', VLASNIK: 'VLASNIK' });
export const ROLE_WORDS = { POSJEDNIK: 'posjednik', VLASNIK: 'vlasnik' };

export const entry = (name, role, detail, parcelId, reference, parcelNumber, municipalityName) =>
  ({ name, role, detail, parcelId, reference, parcelNumber, municipalityName });

/** Every holder and owner of one parcel's sheets. Names without letters are dropped. */
export function entriesOf(parcel, record, folios) {
  const ko = record?.municipality ?? '';
  const held = (record?.sheets ?? []).flatMap((sh) => sh.owners.map((o) =>
    entry(o.name.trim(), Role.POSJEDNIK, `p.l. ${sh.number}`, parcel.id, parcel.reference, parcel.number, ko)));
  const owned = (folios ?? []).flatMap((f) => f.shares.flatMap((share) => share.owners.map((o) => {
    const part = o.share && o.share.trim() ? ` · ${o.share}` : '';
    return entry(o.name.trim(), Role.VLASNIK, `z.k.ul. ${f.unit}${part}`, parcel.id, parcel.reference, parcel.number, ko);
  })));
  return [...held, ...owned].filter((e) => /\p{L}/u.test(e.name));
}

const key = (e) => fold(e.name) + '|' + e.role + '|' + e.reference + '|' + e.detail;

function distinctBy(xs, f) {
  const seen = new Set();
  return xs.filter((x) => { const k = f(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The book with one parcel's entries put in: what that parcel said before is replaced. */
export function add(book, parcelEntries, limit = 20_000) {
  const refs = new Set(parcelEntries.map((e) => e.reference));
  const kept = book.filter((e) => !refs.has(e.reference));
  return [...distinctBy(parcelEntries, key), ...kept].slice(0, limit);
}

/** Names holding every word typed, in any order, without diacritics; the fullest match first. */
export function search(book, query, limit = 30) {
  const q = fold(query).trim();
  if (q.length < 2) return [];
  const words = q.split(/\s+/);
  const found = distinctBy(book.filter((e) => { const n = fold(e.name); return words.every((w) => n.includes(w)); }),
    (e) => fold(e.name) + '|' + e.reference + '|' + e.role);
  return found.map((e, i) => [e, i]).sort(([a, i], [b, j]) => {
    const sa = !fold(a.name).startsWith(words[0]), sb = !fold(b.name).startsWith(words[0]);
    if (sa !== sb) return sa ? 1 : -1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : i - j;
  }).map(([e]) => e).slice(0, limit);
}

/** One entry as a line under the field: the name, and the parcel under it. */
export function hit(e) {
  return makeHit(String(e.parcelId), e.name,
    [e.parcelNumber, e.municipalityName ? `k.o. ${e.municipalityName}` : null, ROLE_WORDS[e.role], e.detail].filter((x) => x != null).join(' · '),
    null, { source: Source.PARCEL, ref: e.reference });
}

export function encode(book) {
  return book.map((e) => [e.name, e.role, e.detail, String(e.parcelId), e.reference, e.parcelNumber, e.municipalityName]
    .map((x) => String(x).replace(/\|/g, '/').replace(/\n/g, ' ')).join('|')).join('\n');
}

export function decode(text) {
  return String(text ?? '').split('\n').map((line) => {
    const p = line.split('|');
    if (p.length < 7 || !Object.values(Role).includes(p[1])) return null;
    return entry(p[0], p[1], p[2], /^-?\d+$/.test(p[3]) ? Number(p[3]) : 0, p[4], p[5], p[6]);
  }).filter(Boolean);
}
