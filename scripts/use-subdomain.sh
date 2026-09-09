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

echo "==> building and running the gates"
ATLAS_SITE="https://$DOMAIN" ATLAS_BASE="" npx astro build
ATLAS_SITE="https://$DOMAIN" ATLAS_BASE="" node scripts/audit.mjs
ATLAS_BASE="" node scripts/linkcheck.mjs

cat <<NEXT

==> built clean. To ship:

    git add -A && git commit -m "Move to $DOMAIN" && git push

Then, once the deploy finishes:
  1. GitHub repo Settings > Pages: confirm the custom domain reads $DOMAIN
     and tick "Enforce HTTPS" once the certificate is issued (can take an hour).
  2. Add https://$DOMAIN/ as a property in Google Search Console and Bing
     Webmaster Tools, and submit https://$DOMAIN/sitemap-index.xml to both.
  3. The jairaj1234-dancer.github.io root repo becomes redundant. The Nighantu
     will serve its own /robots.txt and /llms.txt from the root of $DOMAIN.

NEXT
