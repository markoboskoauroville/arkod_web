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
