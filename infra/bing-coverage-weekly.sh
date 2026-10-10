#!/usr/bin/env bash
# Re-ask Bing the same questions, once a week, and keep each answer.
#
# WHY A LOCAL SCHEDULER AND NOT GITHUB ACTIONS. scripts/bing-coverage.mjs cannot run in CI: this
# repository is public, so Actions logs and artifacts are public, and the output is this project's
# own index coverage. The key is also deliberately local-only, in a gitignored .env.
#
# WHY NOT A CLAUDE CRON. Those live only as long as the session that created them, so a job set a
# week out would never fire.
#
# WHAT MAKES THE COMPARISON VALID. It re-asks the EXACT URL list in data/coverage/sample.txt rather
# than drawing a fresh sample. The sampler is deterministic but samples the current sitemap, and the
# sitemap grows, so a fresh draw would mean a change in the count could be the index moving or the
# sample moving with no way to tell which.
#
# Install:  launchctl load -w ~/Library/LaunchAgents/com.ageayurveda.bing-coverage.plist
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
OUT="$REPO/data/coverage"
STAMP="$(date +%Y-%m-%d)"
LOG="$OUT/run-$STAMP.log"

mkdir -p "$OUT"

if [ ! -f .env ]; then
  echo "[$STAMP] .env missing, so BING_API_KEY is unavailable. Nothing run." > "$LOG"
  exit 0
fi
if [ ! -f "$OUT/sample.txt" ]; then
  echo "[$STAMP] no sample.txt, so there is no fixed URL list to re-ask. Nothing run." > "$LOG"
  echo "Create one with: node --env-file=.env scripts/bing-coverage.mjs" >> "$LOG"
  exit 0
fi

# The sitemap is the population the script reads, and it is a build artefact, so build first.
# Without this a clean working tree would fail on a missing dist/sitemap-0.xml.
{
  echo "[$STAMP] building"
  npm run build >/dev/null 2>&1 || { echo "build failed; not asking Bing"; exit 0; }

  echo "[$STAMP] asking Bing about the fixed sample"
  # --gap 4500 because Bing throttles per host and the first run of this script learned that the
  # hard way: 63 of 83 calls came back ErrorCode 5 and the report was meaningless.
  # --resume so a run killed by memory pressure continues rather than restarting. This machine
  # killed two long processes on 10 October; an unattended weekly run that silently writes nothing
  # is indistinguishable from one that never fired.
  node --env-file=.env scripts/bing-coverage.mjs --urls "$OUT/sample.txt" --gap 4500 --resume

  # Keep every answer under its own date. The whole point is the series, not the latest reading.
  if [ -f "$OUT/bing-coverage.json" ]; then
    cp "$OUT/bing-coverage.json" "$OUT/baseline-$STAMP.json"
    echo "[$STAMP] kept as baseline-$STAMP.json"
  fi
} >> "$LOG" 2>&1
