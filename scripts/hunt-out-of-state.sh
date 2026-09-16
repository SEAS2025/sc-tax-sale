#!/usr/bin/env bash
#
# Unattended out-of-state delinquent-property research.
#
#   Haywood County, North Carolina  (Maggie Valley)  — foreclosure regime
#   Coconino and Mohave County, Arizona (Grand Canyon) — lien-certificate regime
#
# Runs end to end with no interactive agent: verifies official treasurer and
# tax-collector URLs, fetches published delinquent and tax-lien lists, queries
# the Wayback CDX API (throttled, with backoff) for the ~5-years-back side,
# extracts parcel identifiers, pairs recent against historic, rewrites
# docs/OUT_OF_STATE.md, and builds the PDF when real paired data exists.
#
# Public records only. No login, captcha, or paywall is bypassed. No obituary
# or owner-name source is read. Identifiers and amounts only.
#
# Launch detached so it survives an SSH disconnect:
#   cd ~/Projects/sc-tax-sale && setsid nohup bash scripts/hunt-out-of-state.sh \
#     > ~/oos_hunt_$(date +%Y%m%d_%H%M).log 2>&1 < /dev/null &
#
set -u

cd "$(dirname "$0")/.." || exit 1
REPO="$(pwd)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
export PATH="$PATH:/usr/local/bin:/usr/bin"

# Files this job owns. Everything else in the repo belongs to the SC track and
# is never staged here, so a second agent working the same clone is not clobbered.
OWNED=(
  "counties/out-of-state.json"
  "docs/OUT_OF_STATE.md"
  "scripts/hunt-out-of-state.sh"
  "engine/out-of-state.js"
  "engine/out-of-state-ids.js"
  "engine/out-of-state-pdf.js"
  "engine/test-out-of-state.js"
)

say() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# ---------------------------------------------------------------- git helpers

sync_repo() {
  say "git: fetching origin"
  git fetch origin --quiet 2>&1 | tail -3
  # Rebase our own commits on top of whatever the SC agent pushed. Our files do
  # not overlap theirs, so this should never need a manual merge.
  if ! git -c rebase.autoStash=true pull --rebase origin "$BRANCH" 2>&1 | tail -5; then
    say "git: pull --rebase failed, aborting rebase and continuing on local state"
    git rebase --abort >/dev/null 2>&1
  fi
}

checkpoint() {
  local msg="$1"
  local staged=0
  for f in "${OWNED[@]}"; do
    if [ -e "$REPO/$f" ]; then
      git add -- "$f" 2>/dev/null && staged=1
    fi
  done
  [ "$staged" -eq 1 ] || return 0
  if git diff --cached --quiet; then
    say "git: nothing new to commit"
    return 0
  fi
  # Refuse to commit anything that is not on the owned list.
  local extra
  extra="$(git diff --cached --name-only | grep -v -F -x -f <(printf '%s\n' "${OWNED[@]}") || true)"
  if [ -n "$extra" ]; then
    say "git: unexpected staged paths, unstaging them: $extra"
    printf '%s\n' "$extra" | while read -r p; do [ -n "$p" ] && git restore --staged -- "$p"; done
  fi
  git diff --cached --quiet && { say "git: nothing to commit after filtering"; return 0; }
  git commit -q -m "$msg" && say "git: committed — $msg"
  sync_repo
  if git push origin "HEAD:$BRANCH" 2>&1 | tail -3; then
    say "git: pushed"
  else
    say "git: push failed (will retry at next checkpoint); work is committed locally"
  fi
}

# ------------------------------------------------------------------ guardrails

guard_no_raw_files() {
  # inbox/ is gitignored; make sure nothing raw ever slipped into the index.
  local bad
  bad="$(git diff --cached --name-only | grep -E '^inbox/|\.pdf$|\.xlsx$|\.csv$' || true)"
  if [ -n "$bad" ]; then
    say "guard: refusing raw/listing files in the index: $bad"
    printf '%s\n' "$bad" | while read -r p; do [ -n "$p" ] && git restore --staged -- "$p"; done
  fi
}

# ------------------------------------------------------------------- pipeline

say "repo=$REPO branch=$BRANCH node=$(node --version 2>/dev/null) pid=$$"
mkdir -p inbox/out-of-state inbox/repeat

sync_repo

# A PDF engine is optional. Try once to make Chromium available for printing;
# the exporter falls back to designed HTML if this does not work.
if ! command -v google-chrome >/dev/null 2>&1 \
   && ! command -v chromium >/dev/null 2>&1 \
   && ! command -v chromium-browser >/dev/null 2>&1 \
   && [ ! -d "$HOME/.cache/ms-playwright" ]; then
  say "pdf: no browser found, skipping optional chromium download"
fi
if [ -d "$HOME/.cache/ms-playwright" ] && ! ls "$HOME/.cache/ms-playwright" 2>/dev/null | grep -q chromium; then
  say "pdf: installing playwright chromium for printing (optional, non-fatal)"
  timeout 900 npx --yes playwright install chromium >/dev/null 2>&1 \
    && say "pdf: chromium installed" || say "pdf: chromium install skipped"
fi

run_phase() {
  local phase="$1"
  local tries="${2:-2}"
  local n=1
  while [ "$n" -le "$tries" ]; do
    say "phase $phase (attempt $n/$tries)"
    if node engine/out-of-state.js --phase="$phase"; then
      say "phase $phase ok"
      return 0
    fi
    say "phase $phase failed on attempt $n"
    n=$((n + 1))
    sleep $((n * 60))
  done
  say "phase $phase gave up after $tries attempts"
  return 1
}

# 1. Verify every official URL over the network before anything is recorded.
run_phase verify 3
checkpoint "Out-of-state: verify official NC and AZ tax-office sources."
guard_no_raw_files

# 2. Honest land-ownership footing for the Grand Canyon claim.
run_phase land 2
checkpoint "Out-of-state: record Grand Canyon land-ownership sources."

# 3. Published delinquent and tax-lien lists from the verified sources.
run_phase lists 3
checkpoint "Out-of-state: ingest published delinquent and tax-lien lists."
guard_no_raw_files

# 4. Wayback CDX for the ~5-years-back side. Throttled with backoff inside the
#    runner; retried here because the archive returns 503 under load.
run_phase wayback 4
checkpoint "Out-of-state: add Wayback captures for the five-year-back side."

# 5. Pair recent against historic.
run_phase pair 2
checkpoint "Out-of-state: pair recent lists against five-year-earlier lists."

# 6. PDF only if there is real paired data.
run_phase pdf 2
checkpoint "Out-of-state: findings document and paired-parcel report."

# ----------------------------------------------------------------- self-check

say "tests: out-of-state suite"
node --test engine/test-out-of-state.js 2>&1 | tail -25

say "tests: South Carolina suite must stay intact"
npm test 2>&1 | tail -12

say "artifacts:"
ls -la docs/OUT_OF_STATE.md 2>/dev/null
ls -la inbox/repeat/Out-of-state-5-year-delinquent.* 2>/dev/null
ls -la "$HOME/Downloads/Out-of-state-5-year-delinquent.pdf" 2>/dev/null

checkpoint "Out-of-state: final findings for Haywood NC and Coconino/Mohave AZ."
guard_no_raw_files

say "hunt-out-of-state complete"
