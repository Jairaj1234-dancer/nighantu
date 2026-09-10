#!/usr/bin/env bash
# Full content rebuild, in dependency order.
#
# Each step feeds the next: binomials unlock literature matching, citations feed the
# research index, and the date ledger must be stamped before the build so JSON-LD
# carries real dates rather than build time.
set -euo pipefail

echo "==> 1/6 ingest (applies claim verdicts and verified binomials)"
node scripts/ingest.mjs

echo "==> 2/6 citations (local evidence + recovered claims + PubMed top-up)"
node scripts/citations.mjs "$@"

echo "==> 3/6 research index"
node scripts/research-index.mjs

echo "==> 4/6 date ledger"
node scripts/stamp-dates.mjs

echo "==> 5/6 build"
npx astro build

echo "==> 6/6 gates"
node scripts/audit.mjs
node scripts/linkcheck.mjs

echo
echo "pages with citations: $(node -e "
const d=require('./src/data/citations.json').pages;
console.log(Object.values(d).filter(v=>v.citations.length).length+' of '+Object.keys(d).length)
")"
echo "papers in the index:  $(node -e "console.log(require('./src/data/research.json').summary.papers)")"
