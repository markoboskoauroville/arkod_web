// The fetcher (fetcher/worker.js): a wish kept, asked again on the schedule, answered when the state answers.
// GitHub and the state are faked in memory; nothing leaves the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wish, idOf, handle, sweep, REPO } from '../fetcher/worker.js';

const RECORD = 'https://oss.uredjenazemlja.hr/oss/public/cad/parcel-info?parcelId=6436001';
const WFS = 'https://api.uredjenazemlja.hr/services/inspire/cp/wfs?SERVICE=WFS&REQUEST=GetFeature&TYPENAMES=cp:CadastralParcel';

function world() {
  const files = new Map();       // path → { sha, text }
  const commits = [];
  const state = { up: false, asked: 0 };
  let n = 0;
  const fetcher = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const gh = `https://api.github.com/repos/${REPO}/contents/`;
    if (url.startsWith(gh)) {
      assert.match(init.headers.Authorization, /^Bearer /);
      const path = url.slice(gh.length);
      if (method === 'GET') {
        if (files.has(path)) {
          const f = files.get(path);
          return Response.json({ sha: f.sha, content: Buffer.from(f.text).toString('base64') });
        }
        const inside = [...files.keys()].filter((k) => k.startsWith(path + '/'));
        if (inside.length) return Response.json(inside.map((k) => ({ type: 'file', name: k.split('/').pop(), path: k })));
        return new Response('{}', { status: 404 });
      }
      const body = JSON.parse(init.body);
      commits.push(body.message);
      if (method === 'PUT') {
        if (files.has(path) && files.get(path).sha !== body.sha) return new Response('{}', { status: 409 });
        files.set(path, { sha: `s${++n}`, text: Buffer.from(body.content, 'base64').toString() });
        return Response.json({});
      }
      if (method === 'DELETE') { files.delete(path); return Response.json({}); }
    }
    if (url.startsWith('https://oss.uredjenazemlja.hr/') || url.startsWith('https://api.uredjenazemlja.hr/')) {
      state.asked += 1;
      assert.equal(init.headers.Origin, undefined, 'the state is asked without an Origin');
      if (!state.up) return new Response('<ows:ExceptionText>ORA-01000: maximum open cursors exceeded</ows:ExceptionText>', { status: 400, headers: { 'Content-Type': 'text/xml' } });
      return new Response('{"parcelId":6436001,"parcelNumber":"1358/3"}', { headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { files, commits, state, fetcher, env: { GITHUB_TOKEN: 'test-token' } };
}
const req = (path, init) => new Request(`https://arkod-fetcher.example.workers.dev${path}`, init);

test('only the state\'s own addresses, GET, or POST to OSS', () => {
  assert.ok(wish({ url: RECORD }));
  assert.ok(wish({ url: 'https://oss.uredjenazemlja.hr/oss/public/cad/search-parcels', method: 'POST', body: '{}' }));
  assert.equal(wish({ url: 'https://example.com/x' }), null);
  assert.equal(wish({ url: 'https://oss.uredjenazemlja.hr.evil.com/oss/public/' }), null);
  assert.equal(wish({ url: WFS, method: 'POST', body: 'x' }), null);
  assert.equal(wish({ url: RECORD, method: 'DELETE' }), null);
});

test('the same wish has the same id; a different body another', async () => {
  const a = await idOf(wish({ url: RECORD })), b = await idOf(wish({ url: RECORD }));
  assert.equal(a, b);
  assert.equal(a.length, 24);
  const p1 = await idOf(wish({ url: 'https://oss.uredjenazemlja.hr/oss/public/cad/search-parcels', method: 'POST', body: '{"a":1}' }));
  const p2 = await idOf(wish({ url: 'https://oss.uredjenazemlja.hr/oss/public/cad/search-parcels', method: 'POST', body: '{"a":2}' }));
  assert.notEqual(p1, p2);
});

test('wanted, refused while the state is down, fetched when it answers, then served', async () => {
  const w = world();
  let r = await handle(req('/want', { method: 'POST', body: JSON.stringify({ url: RECORD }) }), w.env, w.fetcher);
  const first = await r.json();
  assert.equal(first.state, 'wanted');
  await handle(req('/want', { method: 'POST', body: JSON.stringify({ url: RECORD }) }), w.env, w.fetcher);
  assert.equal([...w.files.keys()].filter((k) => k.startsWith('wanted/')).length, 1, 'wanting twice keeps one file');
  r = await handle(req(`/answer?url=${encodeURIComponent(RECORD)}`), w.env, w.fetcher);
  assert.equal(r.status, 404);

  // the state is down: asked, the reason written once, not again within the hour
  // the clock starts now: /want stamps the real time, so a fixed date would fall behind it (it did, 1.10.2026 11:02)
  let t = Date.now();
  const clock = () => new Date(t);
  await sweep(w.env, w.fetcher, clock);
  const commitsAfterFirst = w.commits.length;
  t += 10 * 60000;
  await sweep(w.env, w.fetcher, clock);
  assert.equal(w.commits.length, commitsAfterFirst, 'a second refusal within the hour writes nothing');
  t += 60 * 60000;
  await sweep(w.env, w.fetcher, clock);
  const st = await (await handle(req(`/status?url=${encodeURIComponent(RECORD)}`), w.env, w.fetcher)).json();
  assert.equal(st.state, 'wanted');
  assert.match(st.last, /ORA-01000/);
  assert.ok(st.tries >= 7, `tries counted from the time: ${st.tries}`);
  assert.equal(w.state.asked, 3);

  // the state answers: kept, no longer wanted, served with its type and when it was fetched
  w.state.up = true;
  const done = await sweep(w.env, w.fetcher, clock);
  assert.equal(done.fetched, 1);
  assert.equal([...w.files.keys()].filter((k) => k.startsWith('wanted/')).length, 0);
  r = await handle(req(`/answer?url=${encodeURIComponent(RECORD)}`), w.env, w.fetcher);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'application/json');
  assert.ok(r.headers.get('X-Fetched-At'));
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await r.json()).parcelNumber, '1358/3');
  const again = await (await handle(req('/want', { method: 'POST', body: JSON.stringify({ url: RECORD }) }), w.env, w.fetcher)).json();
  assert.equal(again.state, 'fetched', 'wanting what is already fetched says so');
});

test('the list of what is still wanted', async () => {
  const w = world();
  await handle(req('/want', { method: 'POST', body: JSON.stringify({ url: RECORD }) }), w.env, w.fetcher);
  await handle(req('/want', { method: 'POST', body: JSON.stringify({ url: WFS }) }), w.env, w.fetcher);
  const list = await (await handle(req('/wanted'), w.env, w.fetcher)).json();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((x) => x.url).sort(), [RECORD, WFS].sort());
});

test('a stranger\'s address is refused; without the token it says so and the schedule does nothing', async () => {
  const w = world();
  const bad = await handle(req('/want', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/' }) }), w.env, w.fetcher);
  assert.equal(bad.status, 400);
  const none = await handle(req('/want', { method: 'POST', body: JSON.stringify({ url: RECORD }) }), {}, w.fetcher);
  assert.equal(none.status, 503);
  assert.match((await none.json()).error, /GITHUB_TOKEN/);
  assert.equal((await sweep({}, w.fetcher)).asked, 0);
  const pre = await handle(req('/want', { method: 'OPTIONS' }), w.env, w.fetcher);
  assert.equal(pre.status, 204);
});
