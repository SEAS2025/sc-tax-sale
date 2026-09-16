#!/usr/bin/env bash
# Deploy the static marketing site to Cloudflare Pages.
# Requires an interactive `npx wrangler login` or CLOUDFLARE_API_TOKEN.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/sync-site-data.js
npx wrangler pages deploy site --project-name=sc-tax-sale
