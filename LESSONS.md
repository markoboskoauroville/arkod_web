# LESSONS (arkod_web)

- **Ask the state through your own proxy.** OSS answers 403 to any request with an Origin header, and the WMS has no CORS.
  A canvas cannot read a cross-origin picture, so recolouring the state's lines needs same-origin tiles.
- **Leaflet does not fire `moveend` for the first `setView`** when handlers are attached afterwards.
  Anything that should run where the map starts (keeping the layer around it) must also be started by hand.
- **Chrome pads opaque responses** in Cache Storage by megabytes each. Ask OSM tiles with `crossOrigin: true` so the kept copies are real CORS responses.
- **Playwright's routes do not see a service worker's own requests** unless `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` is set before the launch.
  Without it, the page behind a service worker quietly asks the real network.
- **`node --test tests/`** fails on Node 22 (it takes the directory as a file). Use `node --test tests/*.test.mjs`.
- **A test that reads the screen right after a click** can catch the page before it redraws. Wait for the state you are checking, not a fixed time.
- **A fake service built on one grid** (60 m Mercator squares) keeps pictures, taps, outlines and the WFS consistent with each other.
  That lets the browser test walk the real flow: tap, trace the outline, second tap, sheet.
- **OffscreenCanvas** is missing from older Safari. A plain `document.createElement('canvas')` works everywhere.
- **A service's first answer is not news.** The log first recorded every grey-to-green as "back online", so every page load
  wrote a line per service and overwrote what fly-through had just said. Log only going down, and coming back after being down.
- **A lit key needs a solid base.** A see-through amber circle vanished over OpenStreetMap's light ground; a dark base under the amber keeps it readable on every map.
- **Keep the state's answers yourself, not only in the service worker.** The service worker is blocked in tests and absent in some
  browsers; answers kept in IndexedDB (`ans:` + URL) give the kept-parcel list, offline sheets and the sniffer's criteria everywhere.

- **The state refuses some of Cloudflare's addresses** (1.10.2026, the first test from the deployed site against the
  real state, from Cloudflare's IAD). OSS's own Apache answered `403 Forbidden` (an HTML page) to about two calls in
  three through `/api/oss`, cadastre and land registry alike, while the same request from a desk was always 200. It is
  **all or nothing per connection**: one kept-alive connection got six 200s, the next six 403s. Retrying inside the
  proxy never helped (version 6 tried six times: six refusals every time), and a browser keeps one connection, so
  retrying in the page would not help either. The proxy names it (`X-State-Refused: address`) and the light says so.
  Whether a phone in Croatia (a European Cloudflare) meets it is not known from here. The Android app asks the state
  from the phone and never meets it.
- **`historicalOverview=true` on `lr/lr-unit` changes nothing.** The land registry's history is
  `lr-units/for-ldb-extract?lrUnitId=…&historical=1` (the deleted shares and parcels, with `status` 1), and its
  `fileUrl` under `reports/ldb-extract/` is the official extract, "povijesni prikaz", as a PDF.
- **A Worker can run on a schedule; Pages cannot** (1.10.2026). "Fetch when available" is a Worker with a cron
  trigger (`fetcher/`), and the page talks to the same code on its own address (`functions/api/later/`), because
  `*.workers.dev` is another origin (and this cloud session cannot reach it at all). The account token here may
  not touch Workers KV, so the queue and the answers live in ARKOD_cache on GitHub: `wanted/<id>.json`,
  `fetched/<id>.json`. A refusal is written at most once an hour, the tries counted from the time.
- **Google ignores `overlay: true` on terrain** (measured on the family site, 1.10.2026): the tiles came back opaque.
  A white-styled street map multiplied over the photo is the see-through layer that works.
