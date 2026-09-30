// /api/oss/<path>?... → https://oss.uredjenazemlja.hr/oss/public/<path>?... with no Origin header.
import { forward, TARGETS, queryOf } from '../../_proxy.js';

/** Only a path made of the characters OSS's own paths use; anything else is refused. */
export function ossPath(params) {
  const parts = Array.isArray(params?.path) ? params.path : [params?.path ?? ''];
  const path = parts.filter(Boolean).join('/');
  return /^[A-Za-z0-9._\-/]+$/.test(path) && !path.includes('..') ? path : null;
}

export async function onRequest({ request, params }) {
  const path = ossPath(params);
  if (path == null) return new Response('bad path', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  return forward(request, 'oss', TARGETS.oss + path + queryOf(request));
}
