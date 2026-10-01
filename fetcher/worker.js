// ARKOD FETCHER: FETCH WHEN AVAILABLE (1.10.2026). Marko: "find a way how to actually have some server
// somewhere to try to fetch it later in the background. Whatever user is requested, it's not available there.
// There will be a button ... fetch when available, and this will be a background service running ... and
// store it to the GitHub."
//
// A Cloudflare Worker, https://arkod-fetcher.<account>.workers.dev, with a schedule (every 10 minutes):
//   POST /want     { url, method?, body? }  the state's own address of what a user asked and did not get;
//                  kept as wanted/<id>.json in the private repository ARKOD_cache
//   GET  /answer?url=…&method=…&body=…     the state's answer, once the Worker has it (fetched/<id>.json); 404 before
//   GET  /status?url=…                     wanted | fetched | unknown, and how many times it was tried
//   GET  /wanted                           everything still waited for
//   the schedule:  each wanted address is asked again; an answer (200) is written to fetched/<id>.json and
//                  the wanted file removed. A refusal is written at most once an hour (the tries are counted
//                  from the time: one every ten minutes), so a service down for a day does not fill the
//                  repository with commits.
// Only the state's three services can be asked (the same three as the site's proxy), and only GET, or POST
// to OSS's search. GITHUB_TOKEN (a Worker secret, set by Marko: a fine-grained token for ARKOD_cache alone,
// Contents read and write) is the only key, and it never leaves the Worker.

export const STATE = [
  'https://oss.uredjenazemlja.hr/oss/public/',
  'https://api.uredjenazemlja.hr/services/inspire/cp/wfs',
  'https://api.uredjenazemlja.hr/services/inspire/cp_wms/wms',
];
export const REPO = 'markoboskoauroville/ARKOD_cache';
export const UA = 'ARKOD-Layer-fetcher/1 (+https://github.com/markoboskoauroville/arkod_web)';
const PER_RUN = 25;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** A wish is the state's address, its method and its body; anything else is refused. */
export function wish(input) {
  const url = String(input?.url ?? '');
  const method = String(input?.method ?? 'GET').toUpperCase();
  const body = input?.body == null ? '' : String(input.body);
  if (!STATE.some((s) => url.startsWith(s)) || url.length > 4000) return null;
  if (method !== 'GET' && !(method === 'POST' && url.startsWith(STATE[0]))) return null;
  if (body.length > 4000) return null;
  return { url, method, body };
}

/** The file name of a wish: the first 24 hex of SHA-256 over method, address and body. */
export async function idOf(w) {
  const bytes = new TextEncoder().encode(`${w.method} ${w.url}\n${w.body}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

const b64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** GitHub's contents API on ARKOD_cache. */
export function github(env, fetcher = fetch) {
  const call = (path, init = {}) => fetcher(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': UA, Accept: 'application/vnd.github+json', ...(init.headers ?? {}) },
  });
  return {
    async read(path) {
      const r = await call(path);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${path}`);
      const j = await r.json();
      const text = new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
      return { sha: j.sha, json: JSON.parse(text) };
    },
    async list(dir) {
      const r = await call(dir);
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${dir}`);
      return (await r.json()).filter((f) => f.type === 'file' && f.name.endsWith('.json')).map((f) => f.path);
    },
    async write(path, json, message, sha) {
      const r = await call(path, { method: 'PUT', body: JSON.stringify({ message, content: b64(JSON.stringify(json, null, 1)), ...(sha ? { sha } : {}) }) });
      if (!r.ok) throw new Error(`GitHub answered ${r.status} writing ${path}`);
    },
    async remove(path, sha, message) {
      const r = await call(path, { method: 'DELETE', body: JSON.stringify({ message, sha }) });
      if (!r.ok && r.status !== 404) throw new Error(`GitHub answered ${r.status} removing ${path}`);
    },
  };
}

/** Ask the state once, as the apps ask it (no Origin), and say what came back. */
export async function ask(w, fetcher = fetch) {
  const init = { method: w.method, headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,image/png,*/*' } };
  if (w.method === 'POST') { init.headers['Content-Type'] = 'application/json'; init.body = w.body; }
  try {
    const r = await fetcher(w.url, init);
    const type = r.headers.get('Content-Type') ?? '';
    const text = await r.text();
    const why = r.ok ? '' : (/ORA-\d+[^<\n]*/.exec(text)?.[0] ?? (/<title>([^<]+)<\/title>/i.exec(text)?.[1]) ?? `answered ${r.status}`).slice(0, 160);
    return { ok: r.ok && !/ExceptionReport/.test(text), status: r.status, type, text, why };
  } catch (e) {
    return { ok: false, status: 0, type: '', text: '', why: `no answer: ${e?.message ?? e}` };
  }
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function handle(request, env, fetcher = fetch) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const u = new URL(request.url);
  if (u.pathname === '/' ) return json({ service: 'ARKOD fetcher', repo: REPO, ready: Boolean(env.GITHUB_TOKEN) });
  if (!env.GITHUB_TOKEN) return json({ error: 'GITHUB_TOKEN is not set on the Worker yet' }, 503);
  const gh = github(env, fetcher);
  const fromQuery = () => wish({ url: u.searchParams.get('url'), method: u.searchParams.get('method') ?? 'GET', body: u.searchParams.get('body') });

  if (u.pathname === '/want' && request.method === 'POST') {
    const w = wish(await request.json().catch(() => null));
    if (!w) return json({ error: 'only the state\'s own addresses can be wanted' }, 400);
    const id = await idOf(w);
    if (await gh.read(`fetched/${id}.json`)) return json({ id, state: 'fetched' });
    const old = await gh.read(`wanted/${id}.json`);
    if (!old) await gh.write(`wanted/${id}.json`, { ...w, wanted: new Date().toISOString(), tries: 0, last: null }, `wanted: ${w.url.slice(0, 120)}`);
    return json({ id, state: 'wanted', tries: old?.json.tries ?? 0 });
  }
  if (u.pathname === '/answer' && request.method === 'GET') {
    const w = fromQuery();
    if (!w) return json({ error: 'not the state\'s address' }, 400);
    const got = await gh.read(`fetched/${await idOf(w)}.json`);
    if (!got) return json({ error: 'not fetched yet' }, 404);
    return new Response(got.json.text, { headers: { ...CORS, 'Content-Type': got.json.type || 'application/json', 'X-Fetched-At': got.json.at, 'Cache-Control': 'no-store' } });
  }
  if (u.pathname === '/status' && request.method === 'GET') {
    const w = fromQuery();
    if (!w) return json({ error: 'not the state\'s address' }, 400);
    const id = await idOf(w);
    const f = await gh.read(`fetched/${id}.json`);
    if (f) return json({ id, state: 'fetched', at: f.json.at });
    const q = await gh.read(`wanted/${id}.json`);
    return json(q ? { id, state: 'wanted', since: q.json.wanted, tries: q.json.tries, last: q.json.last } : { id, state: 'unknown' });
  }
  if (u.pathname === '/wanted' && request.method === 'GET') {
    const out = [];
    for (const path of (await gh.list('wanted')).slice(0, 100)) {
      const q = await gh.read(path);
      if (q) out.push({ id: path.slice(7, -5), url: q.json.url, method: q.json.method, since: q.json.wanted, tries: q.json.tries, last: q.json.last });
    }
    return json(out);
  }
  return json({ error: 'not here' }, 404);
}

/** The schedule: every wanted address asked once more; what answers is kept and no longer wanted. */
export async function sweep(env, fetcher = fetch, now = () => new Date()) {
  if (!env.GITHUB_TOKEN) return { asked: 0, fetched: 0, note: 'no GITHUB_TOKEN' };
  const gh = github(env, fetcher);
  const paths = (await gh.list('wanted')).slice(0, PER_RUN);
  let fetched = 0;
  for (const path of paths) {
    const q = await gh.read(path);
    if (!q) continue;
    const w = wish(q.json);
    const id = path.slice(7, -5);
    if (!w) { await gh.remove(path, q.sha, 'wanted: not the state\'s address, removed'); continue; }
    const got = await ask(w, fetcher);
    const since = Date.parse(q.json.wanted) || now().getTime();
    const tries = Math.max((q.json.tries ?? 0) + 1, 1 + Math.floor((now().getTime() - since) / 600000));
    const written = Date.parse(q.json.written ?? '') || 0;
    if (got.ok) {
      await gh.write(`fetched/${id}.json`, { url: w.url, method: w.method, body: w.body, at: now().toISOString(), wanted: q.json.wanted, tries, status: got.status, type: got.type, text: got.text }, `fetched after ${tries} tries: ${w.url.slice(0, 110)}`);
      await gh.remove(path, q.sha, `no longer wanted: ${id}`);
      fetched += 1;
    } else if (!written || now().getTime() - written >= 3600000) {
      await gh.write(path, { ...q.json, tries, last: `${now().toISOString()} ${got.why}`, written: now().toISOString() }, `still wanted (${tries}): ${got.why.slice(0, 80)}`, q.sha);
    }
  }
  return { asked: paths.length, fetched };
}

export default {
  fetch: (request, env) => handle(request, env).catch((e) => json({ error: String(e?.message ?? e) }, 502)),
  scheduled: (event, env, ctx) => ctx.waitUntil(sweep(env)),
};
