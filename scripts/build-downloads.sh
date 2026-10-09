#!/usr/bin/env bash
# Generate every download the site advertises, in dependency order.
#
# WHY THIS EXISTS AS ONE SCRIPT. The published datasets under public/ are generated rather than
# committed, and .gitignore says so with a warning: "if you add another generated download here, add
# the matching step there too". That step list lived only inside .github/workflows/deploy.yml, so
# every other workflow that builds the site had its own partial copy, and the warning came true.
#
# The citation refresh workflow ran check-retractions on schedule, regenerated the research index,
# then built and ran linkcheck. It failed, every time, on six broken links: /compounds.json,
# /compounds.csv, /dravyaguna.json, /dravyaguna.csv, /taxonomy.json and /verification.json. The
# datasets page links to them, they are gitignored, and that workflow never generated them. So the
# retraction check had been scheduled since the start and had never once completed a run, which is
# the worst shape for a safety check to be in: present, green on the calendar, doing nothing.
#
# Both workflows now call this, so there is one list and it cannot drift from itself.
#
# NETWORK. enrich-access, enrich-taxonomy and enrich-compounds query Unpaywall, GBIF and PubChem,
# all unauthenticated and all cached under data/enrichment/ which is committed. With a warm cache
# they make no requests. A cold entry costs one polite call.
set -euo pipefail

step() { echo ""; echo "==> $*"; }

step "research index and downloads"
node scripts/research-index.mjs

step "dravyaguna dataset (parsed from the monographs, so it cannot drift from them)"
node scripts/dravyaguna.mjs

step "verification ledger (computed from the run artifacts, never hand-edited)"
node scripts/verification.mjs

step "formulary composition dataset"
node scripts/composition-dataset.mjs

step "terminology lexicon dataset"
node scripts/lexicon-dataset.mjs

step "concept dataset"
node scripts/concepts-dataset.mjs

step "formulary ingredient crosswalk dataset"
node scripts/crosswalk-dataset.mjs

step "composition-disclosure evidence"
node scripts/brand-disclosure.mjs --render

step "constituent graph, first pass"
node scripts/compounds.mjs

step "reading-links dataset"
node scripts/enrich-access.mjs

step "botanical taxonomy"
node scripts/enrich-taxonomy.mjs

step "constituent chemistry"
node scripts/enrich-compounds.mjs

# The second pass merges structures the chemistry step resolved. Order matters: run once before
# enrichment and once after, which is what deploy has always done.
step "constituent graph, second pass with merged structures"
node scripts/compounds.mjs

step "corpus manifest"
node scripts/zenodo-deposit.mjs --manifest

echo ""
echo "all downloads generated"
