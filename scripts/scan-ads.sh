#!/usr/bin/env bash
# Refresh the public 2026 ad calendar and rebuild the statewide 5-year file.
# Daily pass over all 46 pages. Counties stay due for 7 days after the
# promised ad / list date so a late posting is still caught.
# Writes ads.json (dates and listing hrefs) and repeat.json (parcel IDs only).
set -euo pipefail
cd "$(dirname "$0")/.."
node engine/cli.js scan --write "$@"
node scripts/sync-site-data.js
