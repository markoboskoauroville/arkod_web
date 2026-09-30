// THE STATE'S SERVICES, THROUGH THIS SITE (30.9.2026). OSS answers 403 when a browser's Origin is
// sent, and the WMS sends no CORS header, so a tile could not be recoloured on a canvas. These
// functions ask the state as an app would (no Origin, no Referer, no cookies) and hand the answer
// back with CORS. Nothing else goes through them: three fixed addresses, GET (and POST for OSS's
// search), and the answer's own status and type.

export const TARGETS = Object.freeze({
  oss: 'https://oss.uredjenazemlja.hr/oss/public/',
  wfs: 'https://api.uredjenazemlja.hr/services/inspire/cp/wfs',
  wms: 'https://api.uredjenazemlja.hr/services/inspire/cp_wms/wms',
});

export const USER_AGENT = 'ARKOD-Layer-web/1 (+https://github.com/markoboskoauroville/arkod_web)';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

/** How long an answer may be kept: pictures and outlines a day, sheets an hour, errors not at all. */
export function cacheSeconds(kind, status) {
  if (status !== 200) return 0;
  if (kind === 'wms' || kind === 'wfs') return 86400;
  return 3600;
}

/**
 * Forward one request to the state. [target] is the full URL, already built from a fixed base; the
 * browser's own headers are not passed on, only a content type for a POST body.
 */
export async function forward(request, kind, target, fetcher = fetch) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET' && !(kind === 'oss' && request.method === 'POST')) {
    return new Response('method not allowed', { status: 405, headers: CORS });
  }
  const headers = { 'User-Agent': USER_AGENT, Accept: kind === 'wms' ? 'image/png,text/plain,*/*' : 'application/json,text/plain,*/*' };
  const init = { method: request.method, headers, redirect: 'follow' };
  if (request.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    init.body = await request.text();
  }
  let answer;
  try {
    answer = await fetcher(target, init);
  } catch (e) {
    return new Response(`the state's service could not be reached: ${e?.message ?? e}`, {
      status: 502, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const out = new Headers(CORS);
  out.set('Content-Type', answer.headers.get('Content-Type') ?? 'application/octet-stream');
  const keep = request.method === 'GET' ? cacheSeconds(kind, answer.status) : 0;
  out.set('Cache-Control', keep > 0 ? `public, max-age=${keep}` : 'no-store');
  return new Response(answer.body, { status: answer.status, headers: out });
}

/** The query string of the request, passed on as it came. */
export const queryOf = (request) => new URL(request.url).search;
