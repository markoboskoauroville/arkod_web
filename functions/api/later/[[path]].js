// FETCH WHEN AVAILABLE, ON THE SITE'S OWN ADDRESS (1.10.2026): /api/later/want, /api/later/answer,
// /api/later/status, /api/later/wanted, the same code as the scheduled Worker (fetcher/worker.js), which asks
// the state again every ten minutes. The page and the Android app ask here; GITHUB_TOKEN is a secret of this
// Pages project (and of the Worker), never in the page.
import { handle } from '../../../fetcher/worker.js';

export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  u.pathname = u.pathname.replace(/^\/api\/later/, '') || '/';
  return handle(new Request(u, request), env).catch((e) =>
    new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }));
}
