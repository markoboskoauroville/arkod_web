# TESTING

## Automatic (on every push, in `.github/workflows/deploy.yml`)
| Command | What it checks |
|---|---|
| `npm test` | 85 unit tests: the Android CoreTest cases ported, plus the canvas restyle, the cache status line, a file made on Android opening here, and the proxies |
| `npm run verify` | files referenced exist, icons and sizes, every import/export, the service worker list, the proxies, the install page, no keys, the workflow, the docs |
| `npm run e2e` | Chromium at 390 x 844 against `tests/fake-state.mjs`: 39 checks, screenshots in `tests/screens/` |

The browser test walks the app step by step:
1. Kukljica (44.036, 15.253) at z17 with the layer drawn. Full screen shows only the map and its key, and the same key comes back. A tap selects 2449/2 and traces its outline.
2. A second tap opens the sheet. Its three tabs (uporaba, posjedovni, vlasnički) are checked, then the filter, a folio link, and "Dodaj u Moje čestice".
3. Settings, then an import of `tests/fixtures/Obitelj.arkod.json`, then the group restyled (colour, solid, bold) and checked in IndexedDB and on the map.
4. The parcel field.
5. A long press opens Parcel view. A parcel cache is filled.
6. The layer key hides the layer. GOO shows the key help; a pasted key is tested at once.
7. The install page, as seen by an iPhone and by an Android phone.
8. A desktop at 1280 px.
9. The service worker keeps the app and the ARKOD layer around the map, and the app opens with no signal.

## By hand, on Marko's phones (the real state; the tests use a fake one)

### iPhone, Safari
1. Open https://arkod-layer.pages.dev/install/. The iPhone steps come first, with three pictures.
2. Share → Add to Home Screen → Add. Open ARKOD Layer from the home screen: full screen, no Safari bars.
3. Zoom to Kukljica (or search the parcel field for `2449/2` from there). The state's lines appear from z14.
4. Tap a parcel: its number and a cyan outline. Tap again: the sheet opens. Check uporaba, posjedovni and vlasnički (the owners, from the land registry).
5. On the vlasnički tab, tap a parcel number in list A: the map goes to that parcel.
6. Try CPY (paste it in Notes), TXT (the share sheet offers "Save to Files") and FILE (a .arkod.json).
7. Turn on "Dodaj u Moje čestice", pick a colour and "puna". Close the sheet: the parcel is drawn in that colour.
8. Long press the parcel-square key: Parcel view. Set the lines to white, 80 %, Bold, and see the layer change.
9. In Parcel view, tap "Cache this view" on a small village. Watch the status line reach "done".
10. Airplane mode. Reopen the app: the map you saw, the layer, and the sheets you opened are still there.
    Search a name in the parcel field: the cache answers.
11. Settings → Moje čestice → export a group (share icon) → Save to Files. Then Import a file, and pick it:
    the group comes back. (A web app on the iPhone cannot be chosen from "Open with", so import is done inside the app.)
12. The full-screen key (top right): only the map is left, with that key; tap it again to come back.
13. GOO: follow the key help, paste your key (or pick the file it is in). The road map appears.

### Android, Chrome
1. Open https://arkod-layer.pages.dev/install/. Android comes first, with the APK link and "Install app".
2. ⋮ → Install app. Open it from the launcher.
3. Repeat steps 3 to 12 above. On a computer, a .arkod.json can also be dragged onto the map.

Write what you find in `momentaryupdates.md` (what, where, the screen), and a new session fixes it.
