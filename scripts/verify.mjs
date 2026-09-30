// THE STRUCTURAL CHECK, run in CI before a deploy: the parts of the site that no unit test sees.
// Every check prints what it examined. Run: npm run verify

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUB = join(ROOT, 'public');
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures += 1; };
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const read = (p) => readFile(p, 'utf8');
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

// 1. the page's own files
const index = await read(join(PUB, 'index.html'));
const local = [...index.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]);
const missing = [];
for (const f of local) if (!await exists(join(PUB, f))) missing.push(f);
check(!missing.length, `index.html: ${local.length} local files referenced (${local.join(', ')})${missing.length ? '; missing ' + missing.join(', ') : ''}`);
check(/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.js/.test(index) && /leaflet\/1\.9\.4\/leaflet\.css/.test(index), 'index.html loads Leaflet 1.9.4 (js and css) from cdnjs');
check(/name="viewport"[^>]*viewport-fit=cover/.test(index) && /apple-mobile-web-app-capable/.test(index), 'index.html has the phone viewport and the iPhone home-screen metas');
for (const id of ['map', 'k-full', 'top', 'lights', 'roundkeys', 'flyline', 'sniffline', 'fields', 'note', 'status', 'keys', 'faces', 'import-file', 'key-file']) {
  if (!index.includes(`id="${id}"`)) check(false, `index.html has #${id}`);
}
check(true, 'index.html has #map #k-full #top #lights #roundkeys #flyline #sniffline #fields #note #status #keys #faces #import-file #key-file');

// 2. the manifest and the icons
const manifest = JSON.parse(await read(join(PUB, 'manifest.webmanifest')));
check(manifest.name === 'ARKOD Layer' && manifest.display === 'standalone' && manifest.start_url, `manifest: name "${manifest.name}", display ${manifest.display}, start_url ${manifest.start_url}`);
async function pngSize(p) { const b = await readFile(p); return b.slice(1, 4).toString() === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; }
for (const icon of manifest.icons) {
  const p = join(PUB, icon.src);
  if (!await exists(p)) { check(false, `manifest icon ${icon.src} exists`); continue; }
  if (icon.type === 'image/png') {
    const [w, h] = await pngSize(p);
    check(`${w}x${h}` === icon.sizes, `manifest icon ${icon.src}: ${w}x${h}, says ${icon.sizes}`);
  } else check(true, `manifest icon ${icon.src} exists`);
}
const touch = await pngSize(join(PUB, 'icons/apple-touch-icon.png'));
check(touch?.[0] === 180, `apple-touch-icon.png is ${touch?.join('x')} (180 wanted)`);
const svg = await read(join(PUB, 'icons/icon.svg'));
const GLYPH = 'M4 4h16v16H4z M4 11h8 M12 4v16 M12 15h8';
check(svg.includes(GLYPH) && /#E8A64B/i.test(svg) && /#0B0D10/i.test(svg), 'icon.svg: the Show/hide ARKOD layer glyph, amber on #0B0D10');
check((await read(join(PUB, 'js/icons.js'))).includes(`parcels: '${GLYPH}'`), 'the key on the map draws the same glyph as the icon');

// 3. version.json
const version = JSON.parse(await read(join(PUB, 'version.json'))).version;
check(Number.isInteger(version) && version > 0, `version.json: version ${version}, a whole number`);

// 4. every module import resolves, and every imported name is exported
const js = (await walk(join(PUB, 'js'))).filter((f) => f.endsWith('.js'));
let names = 0;
for (const f of js) {
  const src = await read(f);
  for (const m of src.matchAll(/import\s*(?:\{([^}]*)\}|\*\s+as\s+\w+)\s*from\s*'([^']+)'/g)) {
    const target = resolve(dirname(f), m[2]);
    if (!await exists(target)) { check(false, `${relative(ROOT, f)} imports ${m[2]}, which exists`); continue; }
    if (!m[1]) continue;
    const t = await read(target);
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      names += 1;
      const re = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
      if (!re.test(t)) check(false, `${relative(ROOT, f)}: ${name} is exported by ${m[2]}`);
    }
  }
  for (const m of src.matchAll(/import\('([^']+)'\)/g)) if (!await exists(resolve(dirname(f), m[1]))) check(false, `${relative(ROOT, f)} imports ${m[1]} dynamically, which exists`);
}
check(true, `${js.length} modules: every import resolves; ${names} imported names checked against their exports`);

// 5. the service worker keeps files that exist
const sw = await read(join(PUB, 'sw.js'));
const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
const absent = [];
for (const f of shell) if (!await exists(join(PUB, f === './' ? 'index.html' : f.endsWith('/') ? f + 'index.html' : f))) absent.push(f);
check(!absent.length, `sw.js keeps ${shell.length} app files at install${absent.length ? '; missing ' + absent.join(', ') : ', all present'}`);
const moduleFiles = js.map((f) => relative(PUB, f));
const notKept = moduleFiles.filter((f) => !shell.includes(f));
check(!notKept.length, `every module is in the service worker's list${notKept.length ? '; not: ' + notKept.join(', ') : ''}`);
check(/googleapis/.test(sw) === false || /network only/i.test(sw), 'sw.js does not keep Google (network only)');

// 6. the proxies
for (const f of ['functions/api/wms.js', 'functions/api/wfs.js', 'functions/api/oss/[[path]].js']) {
  const src = await read(join(ROOT, f));
  check(/export\s+(const|async function|function)\s+onRequest/.test(src), `${f} exports onRequest`);
}
const proxy = await read(join(ROOT, 'functions/_proxy.js'));
check(/Access-Control-Allow-Origin/.test(proxy) && /Cache-Control/.test(proxy), 'functions/_proxy.js adds CORS and cache headers');

// 7. the install page
const install = await read(join(PUB, 'install/index.html'));
check(install.includes('mantra_arkod/releases/latest') && (install.match(/<svg/g) ?? []).length === 3, 'install/: the APK link and three iPhone pictures');

// 8. no key or token anywhere in what is deployed or kept
const KEY = /AIza[0-9A-Za-z_-]{30,}|AQ\.[0-9A-Za-z_.-]{30,}|ghp_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{30,}/;
const scanned = (await walk(ROOT)).filter((f) => /\.(js|mjs|html|json|md|yml|webmanifest|css|txt)$/.test(f) && !f.includes('package-lock'));
const leaks = [];
for (const f of scanned) {
  const m = (await read(f)).match(KEY);
  if (m && !/TEST/.test(m[0])) leaks.push(`${relative(ROOT, f)}: ${m[0].slice(0, 8)}…`);
}
check(!leaks.length, `${scanned.length} files scanned for API keys and tokens${leaks.length ? ': ' + leaks.join(', ') : ': none (the one in tests/e2e.mjs is a made-up TEST key)'}`);

// 9. the deploy
const wf = await read(join(ROOT, '.github/workflows/deploy.yml'));
check(/wrangler(@[\d.]+)? pages deploy public --project-name arkod-layer/.test(wf) && /CLOUDFLARE_API_TOKEN/.test(wf) && /CLOUDFLARE_ACCOUNT_ID/.test(wf),
  'deploy.yml: wrangler pages deploy public --project-name arkod-layer, with the two Cloudflare secrets');

// 9b. help, in English and Croatian (version 4)
for (const f of ['help/en.html', 'help/hr.html']) {
  const t = await read(join(PUB, f));
  const sections = (t.match(/<h2 id="/g) ?? []).length;
  check(sections === 14 && t.includes('href="en.html"') && t.includes('href="hr.html"'), `${f}: ${sections} sections, a link to the other language`);
}
check((await read(join(PUB, 'js/faces.js'))).includes("location.href = 'help/hr.html'"), 'Settings open the help in both languages');

// 10. the docs
for (const f of ['README.md', 'TAKEOVER.md', 'LESSONS.md', 'TESTING.md', 'momentaryupdates.md']) check(await exists(join(ROOT, f)), `${f} is there`);

console.log(failures ? `\n${failures} FAILED` : '\nverify: all checks passed');
process.exit(failures ? 1 : 0);
