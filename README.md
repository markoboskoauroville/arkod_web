# ARKOD Layer, the web app

Croatia's cadastral parcels on a map, in any browser, installable on an iPhone's home screen:
the state's parcel lines over OpenStreetMap or Google, a tap for a parcel, a second tap for its
posjedovni and vlasnički list, **Moje čestice** in groups, parcel caches for no signal, Imenik.

**Live:** https://arkod-layer.pages.dev · **Install:** https://arkod-layer.pages.dev/install/

It is the web twin of the Android app [`mantra_arkod`](https://github.com/markoboskoauroville/mantra_arkod).
Both follow one list, [`mantra_arkod/FEATURES.md`](https://github.com/markoboskoauroville/mantra_arkod/blob/main/FEATURES.md).

## How it is built

- A static PWA with no build step: `public/index.html`, ES modules in `public/js/`, Leaflet 1.9.4 from cdnjs,
  `manifest.webmanifest`, `sw.js` (the service worker).
- `public/js/core/`: the Android app's pure logic, ported from Kotlin (Parcels, ParcelStyle, ParcelCache,
  MarkFile, OwnerBook, Finding, Outline). `tests/core.test.mjs` holds the Android CoreTest cases, ported.
- `functions/`: three Cloudflare Pages Functions that ask the state for the browser.
  They are `/api/wms`, `/api/wfs` and `/api/oss/*`.
  OSS refuses a browser's Origin, and the WMS sends no CORS header.
- Storage:
  - IndexedDB (`arkod-layer`) holds Moje čestice, the caches, Imenik, history, the Google keys and the folio links.
  - localStorage holds only small preferences.
- The service worker keeps map tiles, the state's WMS tiles and OSS answers already seen. The OFF key shows only kept tiles.

## Run it

    npm ci
    npm test          # unit tests (node --test)
    npm run verify    # structural check
    npm run e2e       # Chromium at 390 x 844 against a fake state; screenshots to tests/screens/

To try it by hand with the real state, run `npx wrangler pages dev public`: it serves `functions/` too.

## Deploy

`.github/workflows/deploy.yml` runs on every push to main:

1. The tests, the verify script and the browser test.
2. `npx wrangler pages deploy public --project-name arkod-layer`.
3. A release `vN`, where N comes from `public/version.json`.

It needs two repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
Add them under Settings → Secrets and variables → Actions.

A new version: raise `public/version.json` by one, and `VERSION` in `public/sw.js`.
