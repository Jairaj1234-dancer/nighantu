#!/usr/bin/env bash
# Add the CNAME record for the Nighantu subdomain via the GoDaddy API.
#
# As of April 2026 GoDaddy allows API access on accounts with a single domain,
# so this works without the 10-domain threshold that used to apply.
#
# SETUP, once:
#   1. Go to https://developer.godaddy.com/keys
#   2. Create a PRODUCTION key (not OTE, which is the test environment).
#   3. Save the key and secret into a file, one per line, like this:
#
#        printf '%s\n%s\n' 'YOUR_KEY' 'YOUR_SECRET' > ~/.godaddy-api
#        chmod 600 ~/.godaddy-api
#
#      Putting them in a file rather than pasting them into a chat keeps the
#      credentials out of any transcript.
#
# THEN:
#   ./scripts/add-dns-record.sh nighantu ageayurveda.com
#
# This adds ONE record. It does not touch the A record for the root domain or
# the www CNAME that point at Shopify, and it does not touch MX mail records.
set -euo pipefail

SUB="${1:-nighantu}"
DOMAIN="${2:-ageayurveda.com}"
TARGET="jairaj1234-dancer.github.io"
CRED="${GODADDY_CRED_FILE:-$HOME/.godaddy-api}"

if [[ ! -f "$CRED" ]]; then
  echo "Credential file not found: $CRED" >&2
  echo "See the setup notes at the top of this script." >&2
  exit 1
fi

KEY=$(sed -n '1p' "$CRED" | tr -d '[:space:]')
SECRET=$(sed -n '2p' "$CRED" | tr -d '[:space:]')
if [[ -z "$KEY" || -z "$SECRET" ]]; then
  echo "Could not read a key on line 1 and a secret on line 2 of $CRED" >&2
  exit 1
fi
AUTH="Authorization: sso-key ${KEY}:${SECRET}"
API="https://api.godaddy.com/v1/domains/${DOMAIN}/records"

echo "==> reading existing records for ${DOMAIN} (read-only check)"
EXISTING=$(curl -sS -H "$AUTH" "$API" -w '\n%{http_code}')
CODE=$(printf '%s' "$EXISTING" | tail -1)
if [[ "$CODE" != "200" ]]; then
  echo "GoDaddy API returned HTTP $CODE. Common causes:" >&2
  echo "  401/403  the key is an OTE test key, or the secret is wrong" >&2
  echo "  403      the account is not eligible for API access" >&2
  printf '%s\n' "$EXISTING" | sed '$d' | head -5 >&2
  exit 1
fi
echo "    ok, API access confirmed"

echo "==> current records that would NOT be touched:"
printf '%s\n' "$EXISTING" | sed '$d' | python3 -c "
import json,sys
for r in json.load(sys.stdin):
    if r.get('type') in ('A','CNAME','MX') and r.get('name') in ('@','www') or r.get('type')=='MX':
        print(f\"    {r.get('type'):6} {r.get('name'):6} -> {r.get('data')}\")
" || true

echo "==> setting CNAME ${SUB}.${DOMAIN} -> ${TARGET}"
RESP=$(curl -sS -X PUT "${API}/CNAME/${SUB}" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "[{\"data\":\"${TARGET}\",\"ttl\":3600}]" -w '\n%{http_code}')
CODE=$(printf '%s' "$RESP" | tail -1)
if [[ "$CODE" != "200" ]]; then
  echo "Failed, HTTP $CODE" >&2
  printf '%s\n' "$RESP" | sed '$d' >&2
  exit 1
fi
echo "    record set"

echo "==> waiting for DNS to propagate (up to 5 minutes)"
for i in $(seq 1 20); do
  sleep 15
  if host "${SUB}.${DOMAIN}" 2>/dev/null | grep -qi "$TARGET"; then
    echo "    ${SUB}.${DOMAIN} now resolves to ${TARGET}"
    echo
    echo "Next:  ./scripts/use-subdomain.sh ${SUB}.${DOMAIN}"
    exit 0
  fi
  echo "    still propagating (${i}/20)"
done
echo "Record is set but has not propagated yet. Check with: host ${SUB}.${DOMAIN}"
echo "When it resolves, run: ./scripts/use-subdomain.sh ${SUB}.${DOMAIN}"
