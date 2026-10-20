#!/bin/bash
# Weekly index probe, run on this machine by infra/com.ageayurveda.index-probe.plist.
#
# It used to run in GitHub Actions, which put every reading in public: the commit message, a log
# file in the repo, issue titles and the Actions run summary. The question list, the readings and
# the log now live only in gitignored measurement/index-probe/.
#
# A hit (the site cited) raises a macOS notification in place of the old GitHub issue.
#
# A second engine, Claude with web search, runs after Gemini when ~/.anthropic-api exists. Its
# reading is kept apart (market-map-index-probe-claude-<date>.json, its own log row). Claude
# returns real URLs, so its row says which host was cited, and also which of our hosts the search
# returned without the answer citing them.
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
  // Dated Gemini files only; the Claude file shares the prefix and would otherwise sort last.
  const f = fs.readdirSync(dir).filter((x) => /^market-map-index-probe-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().pop();
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

# ---------------------------------------------------------------- Claude, if a key is present
[ -s "$HOME/.anthropic-api" ] || [ -n "${ANTHROPIC_API_KEY:-}" ] || exit 0
CLOG="$DIR/run-$STAMP-claude.log"
node scripts/market-map.mjs --engine claude --prompts "$DIR/prompts.json" --reps 2 --out "$DIR" > "$CLOG" 2>&1 || {
  echo "| $STAMP | claude | FAILED | probe exited non-zero, see run-$STAMP-claude.log | |" >> "$DIR/log.md"
  exit 1
}
CVERDICT="$(node -e '
  const fs = require("fs");
  const dir = process.argv[1], stamp = process.argv[2];
  const ours = (JSON.parse(fs.readFileSync(dir + "/prompts.json", "utf8")).ours ?? []).map((d) => d.toLowerCase());
  const f = dir + "/market-map-index-probe-claude-" + stamp + ".json";
  if (!fs.existsSync(f)) { console.log("FAILED|no reading was written"); process.exit(0); }
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const isOurs = (h) => ours.some((o) => h === o || h.endsWith("." + o));
  const cited = new Map(), found = new Map();
  for (const r of d.rows ?? []) {
    for (const h of (r.domains ?? []).filter(isOurs)) cited.set(h, (cited.get(h) ?? 0) + 1);
    for (const h of (r.searched ?? []).filter(isOurs)) found.set(h, (found.get(h) ?? 0) + 1);
  }
  const total = d.questionsAsked ?? 0;
  const fmt = (m) => [...m].map(([h, n]) => h + " on " + n + " of " + total).join(", ");
  const extra = found.size ? "; search returned " + fmt(found) : "";
  console.log(cited.size ? "YES|cited: " + fmt(cited) + extra : "no|not cited on any of " + total + " questions" + extra);
' "$DIR" "$STAMP")"
CCITED="${CVERDICT%%|*}"
CDETAIL="${CVERDICT#*|}"
echo "| $STAMP | claude: $CCITED | $CDETAIL | run-$STAMP-claude.log |" >> "$DIR/log.md"
if [ "$CCITED" = "YES" ]; then
  osascript -e "display notification \"$CDETAIL\" with title \"Nighantu index probe: cited by Claude\"" || true
fi
