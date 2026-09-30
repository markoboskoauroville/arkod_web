// FINDING: one list for every search, ported from mantra_arkod Finding.kt. Pure.

export const Source = Object.freeze({ GOOGLE: 'GOOGLE', PARCEL: 'PARCEL' });

/** A result: {id, title, under, distanceM, lat, lon, source, ref}. */
export function hit(id, title, under, distanceM = null, extra = {}) {
  return { id: String(id), title, under, distanceM, lat: null, lon: null, source: Source.GOOGLE, ref: null, ...extra };
}

export const located = (h) => h.lat != null && h.lon != null;

/** Lower case, diacritics off: "Čabrijan" is found by "cabri". */
export function fold(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').replace(/đ/g, 'd');
}

export function matches(text, query) {
  const q = fold(query).trim();
  if (q === '') return true;
  const t = fold(text);
  return q.split(/\s+/).every((w) => t.includes(w));
}

/** Several answers into one list: each place once, nearest first, the ones with no distance after. */
export function merge(lists, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const list of lists) for (const h of list) {
    const same = fold(h.title) + '|' + fold(h.under);
    const a = !seen.has('id:' + h.id);
    if (a) seen.add('id:' + h.id);
    if (a && !seen.has('as:' + same)) { seen.add('as:' + same); out.push(h); }
  }
  const keyed = out.map((h, i) => [h, i]);
  keyed.sort(([a, i], [b, j]) => {
    const na = a.distanceM == null, nb = b.distanceM == null;
    if (na !== nb) return na ? 1 : -1;
    const d = (a.distanceM ?? 0) - (b.distanceM ?? 0);
    return d !== 0 ? d : i - j;
  });
  return keyed.map(([h]) => h).slice(0, limit);
}

/** "stjepana radića 13c" → "stjepana radića 13"; null when there is no letter to drop. */
export function withoutHouseLetter(text) {
  const m = /^(.*\d+)\s*[a-zA-Z]$/.exec(String(text).trim());
  return m ? m[1] : null;
}

/** "850 m", "1.5 km", "68 km". */
export function distanceLabel(metres) {
  if (metres == null) return '';
  if (metres < 1000) return `${metres} m`;
  if (metres < 10_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.floor(metres / 1000)} km`;
}
