#!/usr/bin/env bash
# Full content rebuild, in dependency order.
#
# Each step feeds the next: binomials unlock literature matching, citations feed the
# research index, and the date ledger must be stamped before the build so JSON-LD
# carries real dates rather than build time.
set -euo pipefail

echo "==> 1/8 ingest (applies claim verdicts and verified binomials)"
node scripts/ingest.mjs

echo "==> 2/8 citations (local evidence + recovered claims + PubMed top-up)"
node scripts/citations.mjs "$@"

echo "==> 3/8 research index"
node scripts/research-index.mjs

echo "==> 4/8 dravyaguna dataset (parsed from the monographs, so it cannot drift)"
node scripts/dravyaguna.mjs

echo "==> 5/8 constituent graph + verification ledger"
node scripts/compounds.mjs
node scripts/enrich-taxonomy.mjs
node scripts/enrich-compounds.mjs
node scripts/compounds.mjs   # second pass merges duplicate structures

echo "==> 5b/8 verification ledger (computed from the run artifacts, never hand-edited)"
node scripts/verification.mjs

echo "==> 6/8 date ledger"
node scripts/stamp-dates.mjs

echo "==> 7/8 build"
npx astro build

echo "==> 8/8 gates"
node scripts/audit.mjs
node scripts/linkcheck.mjs
node scripts/crawl-audit.mjs

echo
echo "pages with citations: $(node -e "
const d=require('./src/data/citations.json').pages;
console.log(Object.values(d).filter(v=>v.citations.length).length+' of '+Object.keys(d).length)
")"
echo "papers in the index:  $(node -e "console.log(require('./src/data/research.json').summary.papers)")"
echo "dravyaguna entries:   $(node -e "console.log(require('./src/data/dravyaguna.json').summary.entries)")"
echo "safety records:       $(node -e "try{console.log(require('./src/data/safety.json').count)}catch{console.log(0)}")"
