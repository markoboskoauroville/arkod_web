// A LIGHT FOR EVERY SERVICE, AND ITS LOG (Android v14, v16: Services.kt). Every request reports here;
// the lights say what each service last did; a service going down or coming back is logged.

export const SERVICES = [
  { id: 'WMS', short: 'WMS', title: "ARKOD layer (the state's map service)",
    does: "Draws the state's parcel lines on every map, and says which parcel is under a tap.",
    whenDown: 'No parcel lines where the device has none kept, and a tap cannot say which parcel it is. Kept tiles, Moje čestice and parcel caches still show and still open.' },
  { id: 'WFS', short: 'WFS', title: "Parcel outlines (the state's feature service)",
    does: "Gives each parcel's exact outline: for search results, Moje čestice and new parcel caches.",
    whenDown: 'A parcel found by search opens without its outline, and a new parcel cache cannot be filled. Outlines already kept still show.' },
  { id: 'OSS', short: 'KAT', title: 'Cadastre (OSS): posjedovni list and search',
    does: 'Posjedovni list: holders, shares, land uses, area. And the parcel number search.',
    whenDown: 'Only sheets already on the device open, and a number can be found only in a k.o. searched before.' },
  { id: 'ZK', short: 'ZK', title: 'Land registry (zemljišna knjiga): vlasnički list',
    does: 'Vlasnički list: owners, shares and burdens, from the land registry.',
    whenDown: 'Only owner sheets already on the device open.' },
  { id: 'OSM', short: 'OSM', title: 'OpenStreetMap', does: 'The default map.', whenDown: 'Only the map tiles already seen show. The OFF map works without it.' },
  { id: 'GOOGLE', short: 'GOO', title: 'Google (your key)', does: "Google's map and the Google search field.", whenDown: 'No Google map and no place search. OSM and the OFF map work.' },
];

/** Which service a request went to (this site's proxies, OSM, Google); null for anything else. */
export function of(url) {
  const u = String(url);
  if (u.includes('/api/wms') || u.includes('cp_wms/wms')) return 'WMS';
  if (u.includes('/api/wfs') || u.includes('inspire/cp/wfs')) return 'WFS';
  if (/\/api\/oss\/(lr\/|lr-units\/|search-lr-parcels)/.test(u) || /oss\.uredjenazemlja\.hr.*\/(lr\/|lr-units\/|search-lr-parcels)/.test(u)) return 'ZK';
  if (u.includes('/api/oss') || u.includes('oss.uredjenazemlja.hr')) return 'OSS';
  if (u.includes('openstreetmap.org')) return 'OSM';
  if (u.includes('googleapis.com')) return 'GOOGLE';
  return null;
}

export const Light = Object.freeze({ GREEN: 'GREEN', RED: 'RED', GREY: 'GREY' });

export function light(h) {
  if (!h || (!h.okAt && !h.failAt)) return Light.GREY;
  return h.okAt >= h.failAt ? Light.GREEN : Light.RED;
}

export function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

export function said(h, now, clock) {
  switch (light(h)) {
    case Light.GREY: return 'not asked yet';
    case Light.GREEN: return `online · answered ${ago(now - h.okAt)}`;
    default: return `offline since ${clock(h.failAt)}` + (h.reason ? ` · ${h.reason}` : '');
  }
}

/** CHECK NOW, ONE SERVICE (web v5, Android v19): three tries, 5 s and 10 s apart. */
export const CHECK_WAITS = [0, 5000, 10000];
export const tryLine = (attempt, of) => `checking… try ${attempt} of ${of}`;
export const checkedLine = (back, h) => (back ? 'back online' : 'still offline' + (h?.reason ? ` · ${h.reason}` : ''));

export const due = (h, now, everyMs) => !h || now - Math.max(h.okAt, h.failAt) >= everyMs;

// --- the state of every service, and the log ------------------------------------------------------

export const LOG_SIZE = 300;
export const health = new Map();
export let log = [];
/** Called on every change of a light: (event) => void. */
export const listeners = new Set();

function update(id, change) {
  const before = health.get(id);
  const after = change(before ?? { okAt: 0, failAt: 0, reason: '' });
  health.set(id, after);
  const was = light(before), now = light(after);
  // Logged: going down (a first failure too), and coming back after being down. A first answer is not news.
  if ((now === Light.RED && was !== Light.RED) || (now === Light.GREEN && was === Light.RED)) {
    const e = { at: Math.max(after.okAt, after.failAt), service: id, online: now === Light.GREEN, reason: now === Light.RED ? after.reason : '' };
    log = [e, ...log].slice(0, LOG_SIZE);
    for (const f of listeners) f(e);
  } else for (const f of listeners) f(null);
}

export function ok(url, now = Date.now()) { const id = of(url); if (id) update(id, (h) => ({ ...h, okAt: now })); }
export function failed(url, reason, now = Date.now()) { const id = of(url); if (id) update(id, (h) => ({ ...h, failAt: now, reason: String(reason ?? '').slice(0, 120) })); }

export function restore(events) { log = (events ?? []).slice(0, LOG_SIZE); }
export function reset() { health.clear(); log = []; }

export const shortOf = (id) => SERVICES.find((s) => s.id === id)?.short ?? id;

/** "16:31 WFS offline · ORA-01000" or "17:05 WFS back online". */
export const eventLine = (e, clock) => `${clock(e.at)} ${shortOf(e.service)} ` + (e.online ? 'back online' : 'offline' + (e.reason ? ` · ${e.reason}` : ''));
