#!/bin/bash
# LOCAL_TASKS.md §7 (1.10.2026): the GITHUB_TOKEN for "Fetch when available", from the clipboard into the Worker
# arkod-fetcher and the Pages project arkod-layer. Copy the fine-grained token (ARKOD_cache, Contents: read and
# write) first, then run:   ! bash ~/Developer/arkod_web/scripts/set-fetcher-token.sh
# Nothing is printed: the token goes from the clipboard straight to Cloudflare, then the clipboard is cleared.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(pbpaste | tr -d '[:space:]')
case "$T" in github_pat_*|ghp_*) ;; *) echo "The clipboard does not hold a GitHub token. Copy it and run again."; exit 1;; esac
F=~/Downloads/API/Cloudflare.api.txt
export CLOUDFLARE_ACCOUNT_ID=$(head -1 "$F" | sed -E 's#.*dash.cloudflare.com/([0-9a-f]{32}).*#\1#')
export CLOUDFLARE_API_TOKEN=$(grep -v '^\s*$' "$F" | tail -1 | tr -d '[:space:]')
printf %s "$T" | npx --yes wrangler@3 secret put GITHUB_TOKEN -c fetcher/wrangler.toml >/dev/null && echo "worker arkod-fetcher: GITHUB_TOKEN set"
printf %s "$T" | npx --yes wrangler@3 pages secret put GITHUB_TOKEN --project-name arkod-layer >/dev/null && echo "pages arkod-layer: GITHUB_TOKEN set"
unset T; pbcopy < /dev/null; echo "clipboard cleared"
gh workflow run deploy.yml -R markoboskoauroville/arkod_web && echo "deploy started; in a few minutes:"
echo "  curl -s https://arkod-layer.pages.dev/api/later/   (should say \"ready\":true)"
