#!/usr/bin/env bash
# Move the Nighantu from the GitHub Pages project path to a custom subdomain.
#
#   ./scripts/use-subdomain.sh nighantu.ageayurveda.com
#
# Prerequisite, done once at the registrar for ageayurveda.com:
#
#   Type:  CNAME
#   Host:  nighantu            (just the label, not the full domain)
#   Value: jairaj1234-dancer.github.io.
#   TTL:   default
#
# This script does everything else: writes the CNAME file GitHub Pages needs,
# flips the base path to root, re-ingests so every baked-in link updates,
# rebuilds, re-runs the gates, and pushes.
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "usage: $0 <hostname>   e.g. $0 nighantu.ageayurveda.com" >&2
  exit 1
fi

echo "==> checking DNS for $DOMAIN"
if ! host "$DOMAIN" 2>/dev/null | grep -qi "jairaj1234-dancer.github.io"; then
  echo "DNS for $DOMAIN does not point at jairaj1234-dancer.github.io yet." >&2
  echo "Add the CNAME record at the registrar, wait for propagation, then re-run." >&2
  echo "Check progress with:  host $DOMAIN" >&2
  exit 1
fi
echo "    DNS looks correct"

echo "==> writing public/CNAME"
mkdir -p public
echo "$DOMAIN" > public/CNAME

# The IndexNow key currently lives only in the jairaj1234-dancer.github.io root repo,
# which stops being this site's origin the moment the subdomain goes live. Without a
# copy here every submission would start failing its key check, and it would fail
# quietly: IndexNow returns 403 and nothing else notices. robots.txt does not need the
# same treatment because src/pages/robots.txt.ts generates it at the origin root.
KEY="${INDEXNOW_KEY:-bf9a6ad9a651b9775c941d4fd074a13a}"
echo "==> writing public/$KEY.txt (IndexNow key, previously served by the root repo)"
printf '%s' "$KEY" > "public/$KEY.txt"

echo "==> switching site and base path"
python3 - "$DOMAIN" <<'PY'
import pathlib, re, sys
domain = sys.argv[1]
site = f"https://{domain}"

p = pathlib.Path(".github/workflows/deploy.yml"); s = p.read_text()
s = re.sub(r"^  ATLAS_SITE: .*$", f"  ATLAS_SITE: {site}", s, flags=re.M)
s = re.sub(r"^  ATLAS_BASE: .*$", "  ATLAS_BASE: /", s, flags=re.M)
p.write_text(s)

for f in ("scripts/config.mjs", "astro.config.mjs", "scripts/linkcheck.mjs"):
    p = pathlib.Path(f); s = p.read_text()
    s = s.replace("'https://jairaj1234-dancer.github.io'", f"'{site}'")
    s = s.replace("|| '/nighantu'", "|| ''")
    p.write_text(s)
print(f"    site={site} base=/")
PY

echo "==> re-ingesting so baked-in link prefixes update"
ATLAS_SITE="https://$DOMAIN" ATLAS_BASE="" node scripts/ingest.mjs

echo "==> regenerating the downloads that are generated, not committed"
# Same list as the deploy workflow. If one is added there, add it here too, or the
# migration build will copy a stale file into dist/.
node scripts/research-index.mjs >/dev/null
node scripts/dravyaguna.mjs >/dev/null
node scripts/verification.mjs >/dev/null

echo "==> building and running the gates"
node scripts/test/safety.test.mjs
ATLAS_SITE="https://$DOMAIN" ATLAS_BASE="" node scripts/stamp-dates.mjs
ATLAS_SITE="https://$DOMAIN" ATLAS_BASE="" npx astro build
ATLAS_SITE="https://$DOMAIN" ATLAS_BASE="" node scripts/audit.mjs
ATLAS_BASE="" node scripts/linkcheck.mjs

echo "==> checking the origin-root files will exist at the new root"
for f in robots.txt llms.txt sitemap-index.xml "$KEY.txt"; do
  if [[ -f "dist/$f" ]]; then echo "    ok   /$f"; else echo "    MISSING /$f" >&2; fi
done

echo "==> clearing the IndexNow baseline"
# Every URL changes hostname, so every URL is genuinely new and the whole set must be
# resubmitted once. Without this the change-detection would see identical page content
# and submit nothing at all, and the new hostname would never be announced.
node -e '
const fs = require("fs");
const f = "data/monitor-state.json";
if (!fs.existsSync(f)) process.exit(0);
const s = JSON.parse(fs.readFileSync(f, "utf8"));
if (s.indexnow) { delete s.indexnow.hashes; delete s.indexnow.lastSubmittedAt; }
fs.writeFileSync(f, JSON.stringify(s, null, 1));
console.log("    baseline cleared; the next deploy submits the full set once");
'

cat <<NEXT

==> built clean. To ship:

    git add -A && git commit -m "Move to $DOMAIN" && git push

Then, once the deploy finishes:
  1. GitHub repo Settings > Pages: confirm the custom domain reads $DOMAIN
     and tick "Enforce HTTPS" once the certificate is issued (can take an hour).
  2. Add https://$DOMAIN/ as a property in Google Search Console and Bing
     Webmaster Tools, and submit https://$DOMAIN/sitemap-index.xml to both.
  3. The jairaj1234-dancer.github.io root repo becomes redundant. The Nighantu
     serves its own /robots.txt, /llms.txt and IndexNow key from the root of
     $DOMAIN. Leave the old root files in place for a few weeks rather than
     deleting them: anything that already cached the old key location will keep
     resolving while the new one takes over.
  4. scripts/monitors/config.mjs ROOT_PATHS is relative and needs no edit, but it
     now checks $DOMAIN rather than the github.io root. Run
     \`npm run monitor:dry\` once after the deploy and confirm all three
     origin-root paths return 200.

NEXT
