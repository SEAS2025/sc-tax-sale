#!/usr/bin/env bash
#
# End-to-end statewide hunt, meant to run detached on a big box:
#
#   setsid nohup bash scripts/hunt-all.sh > ~/sc_hunt_$(date +%Y%m%d_%H%M).log 2>&1 < /dev/null &
#
# Phases: hunt for hosted listing files (Wayback CDX, CivicPlus document
# centers, public object-storage prefixes, treasurer site walks), browse the
# hosts that refuse a plain fetch, rebuild the 5-year snapshot, then build the
# workbook and the PDF.
#
# Resumable and idempotent. Every probe verdict is cached in
# inbox/hunt/state.json and every confirmed URL in engine/listings-discovered.json,
# so re-running skips work already done. Safe to kill and restart.
#
# Only derived, owner-free artifacts are committed. inbox/ is gitignored, so
# downloaded listing files, the workbook, and the report PDF stay out of git.

set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
export NODE_OPTIONS="--max-old-space-size=8192"

STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p inbox/hunt inbox/repeat

say() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] == $*"; }

git_id=(-c user.name=SEAS2025 -c user.email=SEAS2025@users.noreply.github.com)

checkpoint() {
  local msg="$1"
  git add engine/listings-discovered.json engine/listings-catalog.js \
          counties/repeat.json site/data/repeat.json docs/HUNT_STATUS.md 2>/dev/null
  if ! git diff --cached --quiet 2>/dev/null; then
    git "${git_id[@]}" commit -q -m "$msg" || true
    # The bundle is the reboot-proof copy. A GitHub push can be refused for
    # token-scope reasons and must never stop the run.
    git bundle create "$HOME/sc-tax-sale-progress.bundle" main >/dev/null 2>&1 || true
    git push origin HEAD >/dev/null 2>&1 || true
    say "checkpoint committed: $msg"
  fi
}

trap 'say "interrupted; progress is in inbox/hunt/state.json"; checkpoint "Checkpoint the interrupted statewide hunt."' INT TERM

say "hunt-all starting in $ROOT (pid $$)"
say "node $(node -v)"

# ---------------------------------------------------------------- phase 1
# The seven counties that already host a current list need only a ~2020-2022
# archive to start producing paired parcels, so they run first and alone.
say "phase 1: current-only counties (need a historic archive)"
node scripts/hunt.js --only bamberg,colleton,dillon,georgetown,greenville,horry,oconee 2>&1
checkpoint "Record archive lists found for the seven current-only counties."

# ---------------------------------------------------------------- phase 2
say "phase 2: counties that have an archive but no current list"
node scripts/hunt.js --only beaufort,cherokee 2>&1
checkpoint "Record current lists found for Beaufort and Cherokee."

# ---------------------------------------------------------------- phase 3
# Hosts that answer 403 to a plain fetch sometimes serve a real browser. This
# is the existing Playwright helper; it only reads public pages.
say "phase 3: browser pass for hosts that refuse a plain fetch"
if [ -d node_modules/playwright ]; then
  node scripts/browse.js berkeley chester dorchester richland kershaw beaufort jasper marion 2>&1 || say "browse pass had failures; continuing"
else
  say "playwright not installed; skipping browser pass"
fi

# ---------------------------------------------------------------- phase 4
say "phase 4: statewide sweep over the remaining counties"
node scripts/hunt.js 2>&1
checkpoint "Record hosted delinquent lists found in the statewide sweep."

# ---------------------------------------------------------------- phase 5
say "phase 5: rebuild the 5-year snapshot"
node engine/cli.js repeat --write 2>&1 | tail -40

say "phase 6: status table"
node scripts/hunt-status.js 2>&1 || say "status table failed; continuing"
checkpoint "Rebuild the 5-year snapshot and coverage status."

say "phase 7: workbook and PDF"
node engine/cli.js repeat --xlsx --pdf 2>&1 | tail -20

say "artifacts:"
ls -lh inbox/repeat/*.xlsx inbox/repeat/*.pdf 2>/dev/null || say "no artifacts found"

node -e '
const s = require("./site/data/repeat.json");
console.log("paired counties:", s.withBoth, "| parcels:", s.bothCount, "| with recent:", s.withRecent, "| with historic:", s.withHistoric);
' 2>&1 || true

say "hunt-all complete"
