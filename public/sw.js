// THE SERVICE WORKER: ARKOD Layer opens with no signal, and shows what was already seen.
//  - the app itself: kept at install, refreshed from the network when there is one;
//  - OpenStreetMap tiles: kept as they are seen; "?offline=1" (the OFF key) answers only from what is kept;
//  - the state's WMS tiles (/api/wms): kept, answered from the device first;
//  - OSS answers (/api/oss GET): the network first, the kept answer when there is none, marked X-Kept-At;
//  - the WFS, OSS searches (POST) and Google: the network only (Google's terms; searches are live).

const VERSION = 'v6';
const APP = `arkod-app-${VERSION}`;
const TILES = 'arkod-tiles';
const WMS = 'arkod-wms';
const OSS = 'arkod-oss';
const LIMITS = { [TILES]: 6000, [WMS]: 8000, [OSS]: 20000 };

const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'version.json',
  'js/app.js', 'js/faces.js', 'js/ui.js', 'js/icons.js', 'js/db.js', 'js/net.js', 'js/layer.js',
  'js/core/parcels.js', 'js/core/style.js', 'js/core/cache.js', 'js/core/markfile.js', 'js/core/ownerbook.js',
  'js/core/finding.js', 'js/core/geo.js', 'js/core/outline.js', 'js/core/query.js', 'js/core/sniff.js', 'js/core/services.js', 'js/scan.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'install/', 'install/index.html', 'help/en.html', 'help/hr.html',
];
const LEAFLET = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await c.addAll(SHELL);
    for (const u of LEAFLET) { try { await c.add(new Request(u, { mode: 'cors' })); } catch { /* kept on first use */ } }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const n of await caches.keys()) if (n.startsWith('arkod-app-') && n !== APP) await caches.delete(n);
    await self.clients.claim();
  })());
});

let trims = 0;
async function keep(cacheName, key, response) {
  const c = await caches.open(cacheName);
  await c.put(key, response);
  if (++trims % 200 === 0) trim(cacheName);
}
async function trim(cacheName) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  const over = keys.length - LIMITS[cacheName];
  for (let i = 0; i < over; i++) await c.delete(keys[i]); // the oldest first: keys() keeps insertion order
}

const osmKey = (url) => `https://tile.openstreetmap.org${url.pathname}`;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (url.hostname === 'tile.openstreetmap.org') {
    const key = osmKey(url);
    if (url.searchParams.has('offline')) {
      e.respondWith((async () => (await caches.match(key, { cacheName: TILES })) ?? new Response('', { status: 404, statusText: 'not kept' }))());
      return;
    }
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok || r.type === 'opaque') keep(TILES, key, r.clone());
        return r;
      } catch {
        return (await caches.match(key, { cacheName: TILES })) ?? Response.error();
      }
    })());
    return;
  }

  if (url.origin !== location.origin) {
    if (LEAFLET.includes(req.url)) e.respondWith((async () => (await caches.match(req.url)) ?? fetch(req))());
    return; // Google and everything else: the network only
  }

  if (url.pathname === '/api/wms') {
    e.respondWith((async () => {
      const kept = await caches.match(req, { cacheName: WMS });
      if (kept) return kept;
      const r = await fetch(req);
      if (r.ok && (r.headers.get('Content-Type') ?? '').startsWith('image/')) keep(WMS, req, r.clone());
      return r;
    })());
    return;
  }

  if (url.pathname.startsWith('/api/oss/') && req.method === 'GET') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) {
          const copy = r.clone();
          const headers = new Headers(copy.headers);
          headers.set('X-Kept-At', new Date().toISOString());
          keep(OSS, req, new Response(await copy.blob(), { status: 200, headers }));
        }
        return r;
      } catch {
        const kept = await caches.match(req, { cacheName: OSS });
        if (kept) return kept;
        return new Response('nema signala, a ovaj list nije spremljen na uređaju', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/api/')) return; // WFS and POST: the network only

  if (req.method === 'GET') {
    // the app: the network first (so a new version shows at once), the kept copy without signal
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(APP)).put(req, r.clone());
        return r;
      } catch {
        return (await caches.match(req, { ignoreSearch: req.mode === 'navigate' })) ?? (await caches.match('index.html')) ?? Response.error();
      }
    })());
  }
});
