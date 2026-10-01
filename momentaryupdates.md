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

1. The web app, every FEATURES.md row. **Status:** done 30.9.2026, version 1. Every FEATURES.md row is "yes" on the web except 25
   (tracks: n/a, a browser cannot record in the background) and 26 (compass: n/a on both, removed at his word).
   Row 19's "open with" is n/a on the iPhone; import there goes through the in-app picker.
   Tested: 85 unit tests, the verify script and 36 browser checks at 390 x 844 against a fake state.
   Not yet: the real state from the deployed site (this sandbox cannot reach it), and a real iPhone. See TESTING.md.
   Marko adds the Cloudflare secrets: arkod_web → Settings → Secrets and variables → Actions → CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
   Then run Actions → deploy → Run workflow.

## 30.9.2026, the message to his father

> then expand the message to my father asking him to also give all the parcel numbers which belongs to
> our family which are missing here, and everything is other, so we can add everything on this map

2. The message to his father (Marinko), in Croatian: what the map is for, and a request for every
   family parcel number still missing, in any k.o., with everything else he knows (sheet and folio
   numbers, whose name, field names, papers). **Status:** written in the chat, 30.9.2026. The family
   page and its tree are still paused (see mantra_arkod/momentaryupdates.md), so the message does not
   promise them.

## 30.9.2026, version 2: full screen

> Since you cannot see dollar balance, please stop checking it. And on the website, please add for map
> the full screen so it can be spread to the full screen with full screen icon, which will be only
> thing visible in the full screen. Go out of the full screen.

1. No more budget lines in the reports. **Status:** done.
2. A full-screen key on the map. In full screen, only the map and that one key are visible (no fields,
   no key row, no top line); the key takes it out again. **Status:** done in v2. The key is at the top
   right. Where the browser allows it (Android Chrome, computers, iPad), the browser's own bars go too;
   an iPhone has no such way for a page, but the home-screen app has no bars anyway. The small map
   credit (© OpenStreetMap) stays, faint: OpenStreetMap's terms require it. FEATURES.md row 27; opened
   for Android.

## 30.9.2026, the message to his father, with the findings

> Please update the message with summary of all findings. How many square meters is there? And you put
> like top owners. Who is— who has the most land out of this? Number 1, how many squares? Number 2. So
> do some summary of all this in the message. All these parcels, their sizes, and who owns Give some
> short summary and say you can see everything breakdown in the website.

1. The message with a summary: total m², the owners ranked by land (m² by their share), each parcel's
   size and owners, and "the whole breakdown is on the website". **Status:** written with blanks. The
   findings are on Marko's phone (the caches and Moje čestice he made there); this session has never
   had them and cannot reach the state. Needs either the data from him or a summary screen in the app.

> ivan Bosko sime bosko died my grandparents

2. Ivana and Šime Boško, his grandparents, have died: the message says so ("pokojna baka Ivana",
   "pokojni djed Šime") and counts the parcels still on their names. **Status:** done in the chat.

> Please write complete message to dad. There is no link to that website. There is no username
> password. Unite all the messages in one. Start with I'm building, this is the username password,
> this is address, and then details under. First most important thing that he goes there to the
> website and then summarize everything under that data.And please, uh, write the messages in code
> box. Everything is in manifest. Why you don't read manifest? Every project should read manifest
> before starting.

3. One message to his father, in a code box, in Marko's voice (MANTRA_MANIFEST
   modules/writing-styles.md §0a: no dashes, no bullets, no bold): the site first (address, user,
   password, from markoboskopossesions' own notes), then the findings, then what we need from him.
   **Status:** done in the chat. The manifest was read (START_HERE, README, writing-styles).

## 30.9.2026, version 3: fly-through scanning, and level with the Android app (v11 to v16)

> I want to add one more feature, and then you need to update both apps, APK and web app, and that is
> fly-through scanning. So in fly-through scanning, user can write anything, and if some, some of this
> text is mentioned in the, uh, parcels I see in my view, they will auto-select. So for example, in
> Kuklica, we can test. You can write Yasha, and then fly through Kuklitsa. And then when Yasha is in
> some of those parcels, they will just auto-select. So there should be also verbose indicator. I, I—
> there will be small airplane, and then I click fly-through scanning, and then, uh, it will just give
> me status scanning, scanning, scanning. Found selecting. So the whole app should be more verbose and
> we always need to know what's going on there. So we are kind of in trace with that when we are
> testing all these services, R-Code and other services you are using. I'm not familiar still what you
> are using everything, but it works. But sometimes looks like this morning when we tested until 9, it
> was not working. And late afternoon after 4:30, this service, one service was out of service. So we
> need to understand what's going on. And how to go around these limitations.

1. Fly-through scanning, the airplane key, as in the Android app v16. **Status:** done in version 3:
   the airplane is a round key over the right end of the key row; the words are asked, and wherever the
   map rests at z16 or closer a 5 x 5 grid is read; a parcel whose sheet mentions them is outlined
   magenta and selected; every step on the line. Tested: "uzorak" over Kukljica finds 2449/2.
2. Level with the Android app: the parcel field wherever the map is (v11), outlines kept one by one
   (v11), the sniffer, its key and keywords, the size and the kept parcels in the settings (v12, v13),
   a light for every service with its log (v14, v16). **Status:** done in version 3 (core/query.js,
   core/sniff.js, core/services.js, scan.js; 15 cases ported from the Android CoreTest; 13 new browser
   checks, 52 in all). Found on the way and fixed in both apps: a service's first answer after the app
   opens was logged as "back online"; now only going down and coming back are.

## 30.9.2026, version 4: help, in English and in Croatian

> please add help section to both apps, web and apk, explaining playground, how it works, what are the
> mechanisms, and how to use it in both languages, croatian and english, so there should be 2 help files

1. Two help pages, help/en.html and help/hr.html, the same text as the Android app's; Settings → Help and
   the install page open them. **Status:** done in version 4: 14 sections each, the same text as the
   Android app v18's; each page links to the other language and back to the map. Every new feature goes
   into both pages.

## 30.9.2026, version 5: "Check now" on every service that is down

> please, next to the offline services inside the settings, and you said it's offline, just add the button
> check now so it can be checked now and maybe make online and make it work

1. As the Android app v19: a "Check now" button on each red or grey service in Settings → Services,
   three tries, each said on the row; when a service is back, what waited for it is done at once.
   **Status:** done in version 5: tested with the fake WFS failing (ORA-01000) and coming back between
   two tries: the button counts, the light turns green, "missing outlines asked" is said. Help updated.

## 1.10.2026, tested against the real state

From Marko's request of 1.10.2026 (word for word in full in mantra_arkod/momentaryupdates.md), the part
for this repository:

> 3. Test both apps against the REAL state services, now that they are reachable: Kukljica (k.o. 334723), parcel 1358/3 (id 6436001) and 2449/2. Read 1358/3's land-registry history (folio 250 with historicalOverview=true) and give me everything about it in one code box.

1. The web app against the real WMS, WFS, OSS and land registry: Kukljica, 1358/3, 2449/2. **Status:** pending.
