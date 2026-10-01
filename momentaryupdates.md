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

1. The web app against the real WMS, WFS, OSS and land registry: Kukljica, 1358/3, 2449/2. **Status:** tests/real-state.mjs
   (`npm run real`) written and run against arkod-layer.pages.dev version 5: the layer, the tap and the second tap
   worked, the sheets did not. Found: the state's OSS refuses some of Cloudflare's addresses (403, about two in three).
2. Version 6: the proxy asked OSS again when it refused the address (up to six times). **Status:** deployed and
   measured: useless. The refusal is all or nothing per connection (one connection six 200s, the next six 403s).
3. Version 7: no retrying; the proxy names the refusal and the light says "the state refused this site's address
   (403)". **Status:** live 1.10.2026, CI green. Real-state run on version 7 (twice, from a cloud session that
   reaches Cloudflare in Ashburn, USA): 6 of 11. The layer (36 real WMS pictures), the tap and the second tap work;
   both sheets and the search were refused by the state, and the sheet now says so in those words. What would fix it (asking the state from another address, or a phone in Croatia
   simply not meeting it) is open: Marko is asked to open a sheet on arkod-layer.pages.dev from his phone.

## 1.10.2026, the remote cache: a private repository ARKOD_cache, Kukljica first; and a question about an emulator

> After you've done this, please create new repository in the GitHub and call it ARKOD_cache. That's the private repository and my both apps can read from there. And this is my private DATA REPOSITORY for the data for all these 3 different access points from the government. And idea is because those, those services are often offline that I give you task which data to sniff and store it there for future use. So if GOVERNMENT points are not accessible, data can be retrieved even if new applications are installed or new users are coming out of the cache data, they can work. So we can call this access point remote cache. And then we need to cache these following sites: VMS, VFS, KAT, ZK. Or as we like to call it, VMS is ArcCode layer, the States Map Service. VFS is Parcel Outlines, the State Feature Service. KAT is Cataster OSS. Posted on the list and search. ZK is land registry. So this data needs to be cached. I will tell you what, what part to cache. Now for first test, take the whole Kukljica opčina area and cache all in this repository.
> a question: are you able to download android emulator for pixel phone version 7 and run it in your environment and test— stress test the application with monkey and all other tests we have in our repository called mantra manifest and mantra manifest intro

Read: "VMS" is WMS (the ARKOD layer, the state's map service), "VFS" is WFS (parcel outlines, the state's
feature service), KAT is the cadastre's OSS (posjedovni list and search), ZK the land registry; "ArcCode"
is ARKOD; "opčina" is the cadastral municipality (k.o.) KUKLJICA, 334723.

1. The private repository markoboskoauroville/ARKOD_cache. **Status:** waiting for Marko: this session may not
   create repositories (GitHub: "sessions are bound to their configured repositories"); he creates it empty,
   then it is attached here and filled.
2. Kukljica cached in it whole: WMS tiles, WFS outlines, KAT records and possession sheets, ZK folios.
   **Status:** sweeping since 1.10.2026 03:50 (scripts/sweep.py: possession sheets, records, folios current and
   with history, the k.o.'s extent, WMS tiles z14 to z18, WFS outlines), into a local folder until the repository
   exists.
3. The "remote cache" access point: both apps read from it when the state does not answer, also on a new
   install. A private repository needs a reader that holds a credential, so the apps read it through the
   web app's server. **Status:** after 1 and 2; the design is put to Marko.
4. The question about a Pixel emulator and the monkey: answered in the chat. **Status:** done: not in this
   container (no /dev/kvm, and the emulator needs it); yes on GitHub Actions, whose Linux runners have KVM.

## 1.10.2026, tested against the real state, from Croatia (the local Claude Code on the Mac, LOCAL_TASKS.md §3)

`npm run real` three times against https://arkod-layer.pages.dev (version 7), Chromium 390 x 844, from Marko's
Mac in Croatia. Cloudflare served every request from Ljubljana (`colo=LJU`, `loc=HR`).

| time | checks passed | what failed |
|---|---|---|
| 06:11 | 2 of 4 (stopped) | the first tap: "KAT offline · the state refused this site's address (403)"; the run stopped waiting for the sheet |
| 06:23 | 1 of 2 (stopped) | the layer never drew in 45 s (0 WMS pictures); OSS 403 |
| 06:26 | 6 of 11 | the layer (52 WMS pictures), both taps, Ivana no longer an owner, no page errors: ok. Uporaba owners, posjedovni list 1225, vlasnički list (z.k. uložak 250), "2449/2 kukljica", the lights (WMS green; WFS, KAT, ZK red): FAIL. One WMS 524 (Cloudflare's timeout). |

Ten separate connections to `/api/oss/cad/parcel-info?parcelId=6436001`, after each run: **0 of 10, 0 of 10,
0 of 10 answered 200**; every one was 403, the state's Apache "Forbidden" page.

**The control, the same minute, the same Mac, straight to the state** (`https://oss.uredjenazemlja.hr/oss/public/cad/parcel-info?parcelId=6436001`):
**10 of 10 answered 200** with 1358/3's record. The Android app on the emulator (the Mac's own address) opened
1358/3's posjedovni list 1225 from the state at 06:20.

So Croatia is refused too, and it is not the country: the state's OSS refuses Cloudflare's outgoing addresses
(from the cloud it was two in three; from Ljubljana, today, every one), and answers a Croatian home address
every time. The fix is to ask the state from another address (or to let the phone ask it itself, as the APK
does, and use the server only as the fallback). **That choice is Marko's.**

## 1.10.2026, "Fetch when available": a background service that asks the state later and keeps the answer

> It is deployed. We need to work on my page which is ard-layer.pages.dev because services are not available all the time. You need to find a way how to actually have some server somewhere to try to fetch it later in the background. Whatever user is requested, it's not available there. There will be a button you need to create, fetch when available, and this will be a background service running. If that cannot be run on Cloudflare, then maybe it can be run on my Oracle virtual machine which I have, and you need to ask Cloud how to access it. We need to find a way to access it using SSH, and then we can work with that machine to be a server for this page so it can fetch data in the background and store it to the GitHub.

Read: "ard-layer.pages.dev" is arkod-layer.pages.dev; "It is deployed" is the family site (markoboskopossesions).

1. A background service that keeps asking the state for what a user asked and did not get, and keeps the
   answer (in ARKOD_cache on GitHub), so the app has it next time. **Status:** written, version 8:
   fetcher/worker.js, a Cloudflare Worker "arkod-fetcher" with a schedule every 10 minutes (deployed from the
   cloud session 1.10.2026 07:50 and by every push), wanted/<id>.json and fetched/<id>.json in ARKOD_cache;
   the page asks the same code on its own address, /api/later/. 5 unit cases. **Waits for one secret:**
   GITHUB_TOKEN (a fine-grained token for ARKOD_cache alone, Contents read and write) on the Worker and on the
   Pages project; until then the server says "GITHUB_TOKEN is not set".
2. A button "Fetch when available" where a request failed. **Status:** written, version 8: on a sheet that
   could not be read; the sheet then opens from the server's answer, marked "poslužitelj dohvatio kasnije";
   Settings → Services → Waiting for the state lists what is waited for. Both help pages. 63 browser checks.
3. Where it runs: Cloudflare if it can (a Worker with a schedule), else Marko's Oracle machine over SSH.
   **Status:** Cloudflare can: no Oracle machine needed. (This cloud session cannot reach SSH or workers.dev.)

Tested live 1.10.2026 11:24 to 11:31 UTC, after Marko set GITHUB_TOKEN (the Worker and Pages): /api/later says
ready; two wishes handed over (2449/2's record from OSS, 1358/3's outline from the WFS); the Worker's 11:30 run
fetched the record on its first try (fetched/9cbfb67ffeb5e74677bd1496.json in ARKOD_cache, served back by
/api/later/answer with X-Fetched-At 11:31:01) and kept the outline wanted with the state's reason ("ORA-00604 …").
The CI failure before it was a test whose clock was fixed at 08:00 (fixed: the clock starts at the real time).

## 1.10.2026, Google refuses satellite in the EU: the light is red, what it means and how to solve it

> What this means and how to solve this problem in my Arkod layer pages there?

(With a screenshot: Settings → Services, "GOO · Google (your key)", red, "offline since 13:33 · Your request
cannot be served because satellite tiles and 3D tiles are not available for your account and region".)

Read: Settings → Google map was on satellite or hybrid. Google serves the road map and terrain on his key, but
refuses satellite and 3D to accounts in the EEA (its terms since 2025). Nothing is down.

1. Satellite and hybrid fall back to an aerial photograph (Esri World Imagery) when Google refuses them,
   hybrid with streets and place names over it; the map says so in one line; the GOO light is not turned
   red by this refusal (it is Google's rule, not an outage). **Status:** done in version 9 (and Android v21):
   satellite shows the aerial photograph, hybrid adds streets and place names (web; Android shows the photograph),
   one line on the map says why, the GOO light stays green; Settings → Google map explains it; both help pages.
   64 browser checks (Google answering as it answers this account).

## 1.10.2026, a long press on GOO chooses Google's view

> I need a new feature inside my ArkodLayer app. Long press on the action bar for Google Maps. G O O. It needs to open different options for different views for Google Maps. Just that, and then when I choose the view it just closes. Easy.

1. A long press on the GOO key opens a small choice of Google's views (map, satellite, terrain, hybrid); a tap
   on one shows it and closes the choice. In both apps (FEATURES row 40) and both help pages.
   **Status:** in progress.
