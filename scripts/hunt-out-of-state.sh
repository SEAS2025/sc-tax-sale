#!/usr/bin/env bash
#
# Unattended out-of-state delinquent-property research.
#
#   Haywood County, North Carolina  (Maggie Valley)  — foreclosure regime
#   Coconino and Mohave County, Arizona (Grand Canyon) — lien-certificate regime
#
# Runs end to end with no interactive agent: verifies official treasurer and
# tax-collector URLs, fetches published delinquent and tax-lien lists, queries
# the Wayback CDX API (throttled, with backoff) for older captures, reads each
# list by column position, intersects every pair of tax years, rewrites
# docs/OUT_OF_STATE.md, and builds the PDF when real paired data exists. The
# report is named for the year span actually found, never for a wished-for one.
#
# Public records only. No login, captcha, or paywall is bypassed. No obituary
# or owner-name source is read. Identifiers and amounts only — the published
# lists do carry an owner column, and it is dropped.
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
  "engine/out-of-state-tables.js"
  "engine/out-of-state-pdf.js"
  "engine/test-out-of-state.js"
)

say() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# ---------------------------------------------------------------- git helpers

# No git identity is configured on this host, so it is supplied per commit with
# -c. Nothing in the user's git config is modified by this script.
GIT_AS=(git -c user.name=SEAS2025 -c user.email=SEAS2025@users.noreply.github.com)

sync_repo() {
  say "git: fetching origin (read only)"
  timeout 90 git fetch origin --quiet 2>&1 | tail -3
}

# Only the owned paths above are ever staged, so a push publishes this track's
# commits and nothing the South Carolina agent has in flight. Set OOS_PUSH=0 to
# commit locally without publishing.
maybe_push() {
  [ "${OOS_PUSH:-1}" = "1" ] || { say "git: push disabled (OOS_PUSH=0)"; return 0; }
  if timeout 120 "${GIT_AS[@]}" -c credential.helper='!gh auth git-credential' push origin "HEAD:$BRANCH" 2>&1 | tail -3; then
    say "git: pushed to origin/$BRANCH"
  else
    say "git: push failed; work is committed locally on this host"
  fi
}

checkpoint() {
  local msg="$1"
  for f in "${OWNED[@]}"; do
    [ -e "$REPO/$f" ] && git add -- "$f" 2>/dev/null
  done
  # Refuse to commit anything that is not on the owned list, so a second agent
  # working this same clone is never swept into our commit.
  local extra
  extra="$(git diff --cached --name-only | grep -v -F -x -f <(printf '%s\n' "${OWNED[@]}") || true)"
  if [ -n "$extra" ]; then
    say "git: unexpected staged paths, unstaging them: $(printf '%s ' $extra)"
    printf '%s\n' "$extra" | while read -r p; do [ -n "$p" ] && git restore --staged -- "$p"; done
  fi
  if git diff --cached --quiet; then
    say "git: nothing new to commit"
    return 0
  fi
  if "${GIT_AS[@]}" commit -q -m "$msg"; then
    say "git: committed — $msg ($(git rev-parse --short HEAD))"
    maybe_push
  else
    say "git: commit failed"
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

# The run is resumable: state.json carries what has already been fetched, so a
# reboot picks up where it left off. After a reader change that state is stale,
# and OOS_RESET=1 sets it aside so every list is read again from scratch.
if [ "${OOS_RESET:-0}" = "1" ] && [ -f inbox/out-of-state/state.json ]; then
  mv inbox/out-of-state/state.json "inbox/out-of-state/state.$(date -u +%Y%m%d%H%M%S).json"
  say "state: previous run set aside, reading every list again"
fi

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

# The report file name states the real year span that was found, so it is
# globbed rather than hard-coded to a five-year name.
say "artifacts:"
ls -la docs/OUT_OF_STATE.md 2>/dev/null
ls -la inbox/repeat/*delinquent.pdf inbox/repeat/*delinquent.html 2>/dev/null
ls -la "$HOME"/Downloads/*delinquent.pdf 2>/dev/null

checkpoint "Out-of-state: final findings for Haywood NC and Coconino/Mohave AZ."
guard_no_raw_files

say "to collect this work from another machine:"
say "  git pull ssh://aimainframe/~/Projects/sc-tax-sale $BRANCH"
say "hunt-out-of-state complete"
