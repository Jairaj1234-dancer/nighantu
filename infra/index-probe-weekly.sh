#!/bin/bash
# Weekly index probe, run on this machine by infra/com.ageayurveda.index-probe.plist.
#
# It used to run in GitHub Actions, which put every reading in public: the commit message, a log
# file in the repo, issue titles and the Actions run summary. The question list, the readings and
# the log now live only in gitignored measurement/index-probe/.
#
# A hit (the site cited) raises a macOS notification in place of the old GitHub issue.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="measurement/index-probe"
STAMP="$(date +%Y-%m-%d)"
RUNLOG="$DIR/run-$STAMP.log"
mkdir -p "$DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[$STAMP] node is not on PATH; set it in the plist's EnvironmentVariables. Nothing ran." > "$RUNLOG"
  exit 1
fi
if [ ! -s "$HOME/.gemini-api" ] && [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "[$STAMP] no ~/.gemini-api and no GEMINI_API_KEY. Nothing ran." > "$RUNLOG"
  exit 1
fi

# pipefail matters: without it a crashed probe would read as a clean "not cited".
node scripts/market-map.mjs --prompts "$DIR/prompts.json" --reps 2 --out "$DIR" > "$RUNLOG" 2>&1 || {
  echo "| $STAMP | FAILED | probe exited non-zero, see run-$STAMP.log | |" >> "$DIR/log.md"
  exit 1
}

# Read the JSON the script wrote, not its printed report.
VERDICT="$(node -e '
  const fs = require("fs");
  const dir = process.argv[1];
  const spec = JSON.parse(fs.readFileSync(dir + "/prompts.json", "utf8"));
  const ours = (spec.ours ?? []).map((d) => d.toLowerCase());
  const f = fs.readdirSync(dir).filter((x) => /^market-map-index-probe-.*\.json$/.test(x)).sort().pop();
  if (!f) { console.log("FAILED|no reading was written"); process.exit(0); }
  const d = JSON.parse(fs.readFileSync(dir + "/" + f, "utf8"));
  const mine = (d.domains ?? []).filter((x) => ours.some((o) => x.domain.includes(o)));
  const total = d.questionsAsked ?? 0;
  console.log(mine.length
    ? "YES|" + mine.map((m) => m.domain + " on " + m.n + " of " + total).join(", ")
    : "no|not cited on any of " + total + " questions");
' "$DIR")"
CITED="${VERDICT%%|*}"
DETAIL="${VERDICT#*|}"
echo "| $STAMP | $CITED | $DETAIL | run-$STAMP.log |" >> "$DIR/log.md"

if [ "$CITED" = "YES" ]; then
  osascript -e "display notification \"$DETAIL\" with title \"Nighantu index probe: cited\"" || true
fi
