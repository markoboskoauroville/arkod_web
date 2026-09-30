# TAKEOVER: what a new session needs to carry on

Read this first, then `momentaryupdates.md` (every request of Marko's, word for word, with its status),
then `mantra_arkod/FEATURES.md` (the list both apps follow).

## The rules Marko set
- Every new request goes word for word into `momentaryupdates.md`, pushed **before** any code.
- No key or token in the repository, a commit or the chat. The verify script scans for them.
- Settings in English; everything of the cadastre in Croatian.
- Portrait phone first (390 px), must also work on a desktop.
- A feature added to one app is written in FEATURES.md in the same commit and opened in the other app.
- Versions are whole numbers: `public/version.json` (and `VERSION` in `sw.js`).
- Test before calling anything done: `npm test`, `npm run verify` and `npm run e2e`.

## Where things are
| File | What |
|---|---|
| `public/js/app.js` | state `S`, the map, taps, the sheet, Moje čestice on the map, loading |
| `public/js/faces.js` | the key row, the two search fields, Parcel view, Moje čestice, caches (the job), Imenik, Settings, Google key help |
| `public/js/layer.js` | the ARKOD layer: WMS tiles restyled on a canvas; caches drawn in their own colour |
| `public/js/net.js` | every request: the proxies, and Google with the user's key |
| `public/js/ui.js` | the seven control kinds (TRAIL language) |
| `public/js/core/*` | the ported Kotlin logic; unit-tested |
| `public/sw.js` | what is kept for no signal |
| `functions/` | the proxies to the state |
| `tests/fake-state.mjs` | a fake WMS/WFS/OSS on a 60 m grid over Kukljica for the browser test |

## The state's services, as learnt on Android
- WMS: 512 px tiles at dpi:180, from z14. GetFeatureInfo is text/plain and gives the parcel in a fifth of a second.
- WFS: slow, and it fails in spells (ORA-01000). The cache job retries 8 times over about five minutes.
- OSS: parcel-info, lr-unit (folio), suggestions and search. It answers **403** when an Origin header is sent, so the proxy strips it.

## Open ends
- Nobody has tested against the real state from the deployed site yet (this sandbox cannot reach it); see TESTING.md.
- The Croatia offline map file (176 MB, Android's OFF) is not on the web. There, OFF means the tiles already seen.
