# Momentary updates: Marko's requests, word for word

Every new request lands here first. "Continue" means: read this file first.

## 30.9.2026, ARKOD Layer for the iPhone, as a web app, in step with the Android app

> Is it possible to convert this app to have 2 installations for iPhone and for Android, which we have,
> but iPhone is missing? Is it possible to build it in the same page, build page, so user can by
> himself install it out of their store?

> okay, so let's build the web app then , But I want to build it in CloudSession. Now just write the
> prompt from CloudSession and I will paste it in CloudSession.and those 2 apps, android app and web
> app, should be in sync with features

The Android app is `markoboskoauroville/mantra_arkod`; its `FEATURES.md` is the list both apps follow.

## 30.9.2026, the build brief, pasted into the cloud session

> You are building ARKOD Layer as a web app (PWA) for Marko Boško, so iPhone users (and anyone with a
> browser) get the same app Android users have. Everything below is decided; build it, test it, push it.
>
> ## Read first, in this order
> 1. markoboskoauroville/arkod_web: momentaryupdates.md (Marko's request, word for word). This is your repository; it exists and is public.
> 2. markoboskoauroville/mantra_arkod: FEATURES.md. THE list both apps follow, 26 rows with an Android and a Web column. Your job is to turn every Web "no" into "yes", or into "n/a" with the reason written.
> 3. mantra_arkod: momentaryupdates.md (every request since 29.9.2026, with statuses), README.md, and the Kotlin sources under app/src/main/java/com/mantra/arkod/. The pure logic in Parcels.kt, ParcelStyle.kt, ParcelCache.kt, MarkFile.kt, OwnerBook.kt and Finding.kt is the reference behaviour. Port it to JavaScript modules that behave the same, and port the matching cases from app/src/test/java/com/mantra/arkod/CoreTest.kt as node:test tests.
> 4. markoboskoauroville/MANTRA_MANIFEST: START_HERE, modules/language-trail.md and mantra-design-language.md (the TRAIL visual language: ground #0B0D10, card #16191D, sand #F2DDB4, amber #E8A64B only for the one action, raised #2C323A for a chosen part, never amber for a state), modules/versioning.md (whole numbers only: v1, v2, v3), modules/mantra-testing.md, modules/writing-styles.md.
>
> ## Rules that do not bend
> - Every new request from Marko goes word for word into arkod_web/momentaryupdates.md and is pushed before any code.
> - No key or token in the repository, in a commit or in the chat.
> - Settings are in English; everything of the cadastre stays Croatian (čestica, posjedovni list, vlasnički list, k.o., uporaba, and the sheet's own words).
> - Portrait phone first, 390 px wide; it must also work on a desktop.
> - README.md, TAKEOVER.md and LESSONS.md in the repository, kept current.
> - Keep FEATURES.md in step. Update the Web column in mantra_arkod/FEATURES.md in the same commit that finishes a feature. If you cannot push to mantra_arkod, keep the rows in arkod_web/FEATURES_WEB.md and say so plainly in your final report.
>
> ## Stack
> - Static PWA, no build step: index.html, ES modules, Leaflet 1.9.4 from cdnjs.cloudflare.com, manifest.webmanifest, and a service worker. The icon is the Show/hide ARKOD layer key's glyph, SVG path "M4 4h16v16H4z M4 11h8 M12 4v16 M12 15h8" drawn as amber stroke on #0B0D10, with 192 and 512 PNGs and an apple-touch-icon.
> - Cloudflare Pages Functions under /functions as proxies, because the state's services refuse browsers:
>   - /api/oss/* forwards to https://oss.uredjenazemlja.hr/oss/public/* with no Origin header (OSS answers 403 when a browser's Origin is sent).
>   - /api/wfs forwards to https://api.uredjenazemlja.hr/services/inspire/cp/wfs.
>   - /api/wms forwards to https://api.uredjenazemlja.hr/services/inspire/cp_wms/wms and returns the PNG with CORS, so tiles can be recoloured on a canvas.
>   - Add CORS and cache headers. Nothing else goes through them.
> - Storage on the device in IndexedDB: Moje čestice with their groups, parcel caches, Imenik, search history, the Lines style, the Google key. localStorage only for small preferences. The service worker keeps map tiles, WMS tiles and OSS answers already seen, so places visited work without signal.
> - Deploy with a GitHub Actions workflow: `npx wrangler pages deploy public --project-name arkod-layer`, using the repository secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Marko adds those two secrets himself. Tell him exactly where, and never ask for their values. The site is https://arkod-layer.pages.dev.
> - Versions are whole numbers in one place (version.json). Settings show "ARKOD Layer · version N", linking to the latest release.
>
> ## The state's services (all public, no key; measured 27 to 30.9.2026)
> - WMS picture: GetMap, LAYERS=cp:CP.CadastralParcel, CRS=EPSG:3857, 512x512 tiles, FORMAT_OPTIONS=dpi:180, TRANSPARENT=true. Shown from zoom 14. The lines are black, about 4 px wide.
> - GetFeatureInfo under a finger: the same WMS, INFO_FORMAT=text/plain (json is forbidden), FEATURE_COUNT=1. It gives ID (the parcel id OSS uses), BROJ_CESTICE and MATICNI_BROJ_KO. With layer cp:CP.CadastralZoning it gives the cadastral municipality.
> - WFS outlines: TYPENAMES=cp:CadastralParcel, OUTPUTFORMAT=application/json, SRSNAME=urn:ogc:def:crs:EPSG::4326. By reference: CQL_FILTER=nationalCadastralReference IN ('334723-2449/2'). By area: BBOX=south,west,north,east,urn:ogc:def:crs:EPSG::4326 with COUNT=500 and STARTINDEX paging (about 15 s a page). properties.referencePoint is where the number is written. IT FAILS IN SPELLS (ORA-01000, for tens of minutes): retry 8 times over about 5 minutes and show the state's own reason. Parcels.stateReason() shows how to read it.
> - The possession sheet: GET /oss/public/cad/parcel-info?parcelId=ID. Parcels.parseRecord() shows the fields.
> - Search: POST /oss/public/cad/search-parcels with {"cadMunicipalityId": <OSS internal id, 1354 for Kukljica>, "parcelNumber": "..."} or {"possessionSheetNumber": "..."}. It returns the parcels with their possessors.
> - Suggestions as you type: GET /oss/public/search-cad-parcels/parcel-numbers?search=245&municipalityRegNum=334723
> - The owner sheet: GET /oss/public/lr/lr-unit?lrUnitNumber=..&mainBookId=..&historicalOverview=false. Parcels.parseFolio() shows the fields; list A holds the folio's parcels.
> - Google: the user's own key, Map Tiles API. createSession, then 2dtiles. Google refuses satellite tiles to EEA accounts ("not available for your account and region"), so the road map is the default. Tell users to restrict the key to the site's HTTP referrer.
>
> ## Build every row of FEATURES.md for the web
> The three map keys; the ARKOD layer; the Show/hide ARKOD layer key (a tap, and a long press for Parcel view); Lines restyled on a canvas exactly as ParcelStyle.restyle does; tap to select and tap again for the sheet; the sheet with its three tabs, filter, CPY, TXT and FILE; the owner sheet, with its list A numbers as links; the centre coordinates on the top line and where-am-I (Geolocation); Google's search field; the parcel field with suggestions, "pl N" and names; search history in every box; Imenik; Moje čestice with groups and their look; .arkod.json import (file picker and drag-drop) and export (Web Share API with files, else download), in the exact format and behaviour of MarkFile.kt; parcel caches with verbose status, their own lines inside their box (clear the state's pixels there, draw the cache's parcels and numbers), and offline search over them. OFF means the tiles already seen, kept for no signal. Track recording is n/a on the web; write why.
>
> ## An install page, inside the same site
> /install: for iPhone, Safari → Share → Add to Home Screen, with three pictures drawn as SVG. For Android: the APK at https://github.com/markoboskoauroville/mantra_arkod/releases/latest, or Chrome → Install app. Detect the phone and show its way first. The app's settings link to it.
>
> ## Test before calling anything done
> - node --test for every ported pure module, at least the same cases as CoreTest.kt for them.
> - A structural check script like mantra_arkod/scripts/verify.py (every check prints what it examined), run in CI.
> - Headless Chromium (Playwright, if the environment has it) at 390x844. Open Kukljica (44.036, 15.253) at zoom 17, see the ARKOD layer, tap a parcel, open 2449/2's sheet with all three tabs, import a sample .arkod.json, and style its group. Screenshots go into tests/screens/.
> - TESTING.md: what Marko checks on his iPhone (add to home screen, open offline after a visit, import a file from WhatsApp or Files) and on Android Chrome.
>
> ## When you finish
> Push. Write in momentaryupdates.md what each request's status is. Update FEATURES.md (Web column) as described above. Then give Marko, in plain words:
> 1. what works, with the site link;
> 2. what he must do: add the two Cloudflare secrets to arkod_web (Settings → Secrets and variables → Actions), then run the workflow;
> 3. what was not tested and why;
> 4. every FEATURES.md row that is still not "yes" on the web, with the reason.

1. The web app, every FEATURES.md row. **Status:** in progress.
