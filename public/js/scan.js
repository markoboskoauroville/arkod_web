// WHAT READS IN THE BACKGROUND (web v3, Android v12 and v16): the sniffer (the cache key), fly-through
// scanning (the airplane), and the light check (the service lights). The decisions are in core/sniff.js
// and core/services.js; this asks the state through net.js and says every step through onChange.

import * as P from './core/parcels.js';
import * as Sn from './core/sniff.js';
import * as Services from './core/services.js';
import { distance } from './core/geo.js';
import * as net from './net.js';

/** Run [work] over [items], [n] at a time; stops early when [alive] turns false. */
async function pool(items, n, work, alive = () => true) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length && alive()) { const x = items[i++]; await work(x); }
  }));
}

/** A grid of points over a Leaflet bounds, the middle first. */
const gridOver = (b, n) => Sn.grid(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), n);

async function foliosOf(record, read) {
  const books = [...new Map(record.landBooks.filter((b) => b.bookId && b.unit).map((b) => [b.bookId + '|' + b.unit, b])).values()];
  const out = [];
  for (const b of books) {
    const url = P.folioUrl(b.bookId, b.unit, net.API.oss);
    try { const t = await read(url); const f = P.parseFolio(t); if (f) out.push([url, t, f]); } catch { /* the land registry did not answer */ }
  }
  return out;
}

// --- the sniffer (the cache key) -------------------------------------------------------------------

export const Sniffer = {
  on: false,
  criteria: [],
  tally: { read: 0, kept: 0, skipped: 0, failed: 0, busy: false },
  onSheet: null,
  onChange: null,
  seen: new Set(),
  lastAt: null,
  run: 0,

  start() { this.on = true; this.run += 1; },
  stop() { this.on = false; this.run += 1; this.seen.clear(); this.lastAt = null; this.set({ busy: false }); },
  set(change) { this.tally = { ...this.tally, ...change }; this.onChange?.(this.tally); },

  /** The map rests: the parcels under a 4 x 4 grid, once per 150 m moved, from z16. */
  async viewSettled(bounds, zoom) {
    if (!this.on || zoom < 16) return;
    const c = bounds.getCenter();
    if (this.lastAt && distance(this.lastAt[0], this.lastAt[1], c.lat, c.lng) < 150) return;
    this.lastAt = [c.lat, c.lng];
    const run = this.run;
    this.set({ busy: true });
    const found = [];
    await pool(gridOver(bounds, 4), 3, async ([la, lo]) => {
      try { const p = await net.parcelUnder(la, lo); if (p) found.push(p); } catch { /* the WMS light says it */ }
    }, () => this.run === run);
    await pool(found.filter((p) => !this.seen.has(p.id) && this.seen.add(p.id)), 2, (p) => this.sniff(p), () => this.run === run);
    if (this.run === run) this.set({ busy: false });
  },

  /** A sheet he opened: the other parcels of its owner sheets. */
  async follow(record, folios) {
    if (!this.on || !record.municipalityNumber) return;
    const numbers = [...new Set(folios.flatMap((f) => f.parcels.map((x) => x.trim().split(/\s+/)[0])))]
      .filter((n) => n !== record.number && /^\*?\d+(\/\d+)?$/.test(n)).slice(0, 40);
    const run = this.run;
    this.set({ busy: true });
    const parcels = [];
    for (const n of numbers) {
      try { const id = await net.idOf(n, record.municipalityNumber); if (id) parcels.push(P.parcel(id, n, `${record.municipalityNumber}-${n}`)); } catch { /* the KAT light says it */ }
    }
    await pool(parcels.filter((p) => !this.seen.has(p.id) && this.seen.add(p.id)), 2, (p) => this.sniff(p), () => this.run === run);
    if (this.run === run) this.set({ busy: false });
  },

  async sniff(p) {
    const url = P.recordUrl(p.id, net.API.oss);
    let got;
    try { got = await net.peek(url); } catch { this.set({ read: this.tally.read + 1, failed: this.tally.failed + 1 }); return; }
    if (got.wasKept) return;
    let record;
    try { record = P.parseRecord(got.text); } catch { return; }
    const folios = await foliosOf(record, async (u) => (await net.peek(u)).text);
    const fits = Sn.fits(Sn.wordsOf(record, folios.map((f) => f[2])), this.criteria);
    if (!fits) {
      // Not his: the service worker's copy goes too, so nothing that does not fit is kept.
      if ('caches' in globalThis) caches.open('arkod-oss').then((c) => c.delete(url)).catch(() => {});
      this.set({ read: this.tally.read + 1, skipped: this.tally.skipped + 1 });
      return;
    }
    await net.keep(url, got.text);
    for (const [u, t] of folios) await net.keep(u, t);
    this.onSheet?.(p, record, folios.map((f) => f[2]));
    net.shapes([p.reference], { tries: 1 }).catch(() => {});
    this.set({ read: this.tally.read + 1, kept: this.tally.kept + 1 });
  },
};

// --- fly-through scanning (the airplane) -----------------------------------------------------------

export const Flyer = {
  state: Sn.flyState(),
  criteria: [],
  seen: new Set(),
  lastAt: null,
  run: 0,
  onFound: null,
  onChange: null,

  set(change) { this.state = { ...this.state, ...change }; this.onChange?.(this.state); },

  start(query) {
    this.run += 1;
    this.criteria = Sn.criteria(query);
    this.seen.clear();
    this.lastAt = null;
    this.state = Sn.flyState({ query: String(query).trim(), on: true });
    this.onChange?.(this.state);
  },

  stop() { this.run += 1; this.state = Sn.flyState(); this.onChange?.(this.state); },

  /** The map rests: a 5 x 5 grid over the screen, from z16, once per 60 m moved. */
  async viewSettled(bounds, zoom) {
    if (!this.state.on) return;
    if (zoom < 16) { this.set({ stage: Sn.Stage.ZOOM }); return; }
    const c = bounds.getCenter();
    if (this.lastAt && distance(this.lastAt[0], this.lastAt[1], c.lat, c.lng) < 60) return;
    this.lastAt = [c.lat, c.lng];
    const run = ++this.run;
    const points = gridOver(bounds, 5);
    this.set({ stage: Sn.Stage.SCANNING, asked: 0, total: points.length, selecting: null, problem: null });
    await pool(points, 3, (pt) => this.scan(pt, run), () => this.run === run);
    if (this.run === run) this.set({ stage: Sn.Stage.DONE, selecting: null });
  },

  async scan([la, lo], run) {
    let p;
    try { p = await net.parcelUnder(la, lo); } catch { this.set({ asked: this.state.asked + 1, problem: 'ARKOD (WMS) not answering' }); return; }
    if (this.run !== run) return;
    this.set({ asked: this.state.asked + 1 });
    if (!p || this.seen.has(p.id)) return;
    this.seen.add(p.id);
    const read = async (u) => { const g = await net.peek(u); if (!g.wasKept) await net.keep(u, g.text); return g.text; };
    let record;
    try { record = P.parseRecord(await read(P.recordUrl(p.id, net.API.oss))); } catch { this.set({ problem: 'cadastre (KAT) not answering' }); return; }
    if (this.run !== run) return;
    this.set({ read: this.state.read + 1 });
    let why = Sn.why(record, [], this.criteria);
    if (!why) why = Sn.why(null, (await foliosOf(record, read)).map((f) => f[2]), this.criteria);
    if (!why || this.run !== run) return;
    this.set({ selecting: p.number });
    let rings = [];
    try { rings = (await net.shapes([p.reference], { tries: 1 })).find((x) => x.reference === p.reference)?.rings ?? []; } catch { /* the WFS light says it */ }
    if (!rings.length) { try { rings = (await net.outline(la, lo)) ?? []; } catch { rings = []; } }
    this.set({ found: [...this.state.found, [p.number, why]] });
    this.onFound?.({ ...p, rings }, why);
    await new Promise((r) => setTimeout(r, 600));
    if (this.state.selecting === p.number) this.set({ selecting: null });
  },
};

// --- the light check -------------------------------------------------------------------------------

/** Every minute, a service not heard from for three minutes is asked once (never Google). */
export function lightCheck() {
  const tick = () => {
    const now = Date.now();
    for (const s of Services.SERVICES) if (s.id !== 'GOOGLE' && Services.due(Services.health.get(s.id), now, 180_000)) net.check(s.id);
  };
  setTimeout(tick, 3000);
  return setInterval(tick, 60_000);
}

 /** Check now, until it answers (web v5): true as soon as the service answers. */
export async function checkUntilBack(id, onTry) {
  for (let i = 0; i < Services.CHECK_WAITS.length; i++) {
    if (Services.CHECK_WAITS[i]) await new Promise((r) => setTimeout(r, Services.CHECK_WAITS[i]));
    onTry?.(i + 1);
    await net.check(id);
    if (Services.light(Services.health.get(id)) === Services.Light.GREEN) return true;
  }
  return false;
}

export const checkAll = () => Promise.all(Services.SERVICES.filter((s) => s.id !== 'GOOGLE').map((s) => net.check(s.id)));
