#!/usr/bin/env bash
# Record what ageayurveda.com's DNS answers today, so a change can be checked against it.
#
# WHY. Putting nighantu.ageayurveda.com behind Cloudflare on the free plan requires moving the whole
# zone off GoDaddy, and that zone carries the Shopify store and the business's email. The way that
# goes wrong is not dramatic: Cloudflare's import scanner misses a record, everything looks fine
# because the store still loads, and mail quietly stops being delivered or starts failing SPF.
#
# Checking afterwards is only meaningful against a record of before. This writes one.
#
#   ./infra/dns-baseline.sh                    print the current answers
#   ./infra/dns-baseline.sh > before.txt       keep them, BEFORE touching the nameservers
#   ./infra/dns-baseline.sh | diff before.txt -    after the move: expect no output
#
# A clean diff is necessary and not sufficient. It says the records resolve the same. It does not
# say mail is delivered, which only an actual message to an @ageayurveda.com address proves.
#
# Deliberately uses dig against a PUBLIC RESOLVER rather than the system one, because a stale local
# or ISP cache is exactly what makes a broken migration look fine for the first hour.
set -euo pipefail

ZONE=ageayurveda.com
RESOLVER=${RESOLVER:-1.1.1.1}

q() {
  # Sorted, because resolvers return multi-record answers in rotating order and an unsorted list
  # diffs as a change on every run for no reason.
  local name=$1 type=$2
  printf '%-34s %-6s ' "$name" "$type"
  local out
  out=$(dig +short "@$RESOLVER" "$type" "$name" 2>/dev/null | LC_ALL=C sort | paste -sd' ' -)
  printf '%s\n' "${out:-(none)}"
}

echo "# DNS baseline for $ZONE, via $RESOLVER"
echo "# nameservers are the thing being changed, so they are first"
q "$ZONE" NS
echo
echo "# the live store"
q "$ZONE" A
q "www.$ZONE" CNAME
q "www.$ZONE" A
echo
echo "# the live email: losing MX or SPF is the failure that goes unnoticed"
q "$ZONE" MX
q "$ZONE" TXT
q "_dmarc.$ZONE" TXT
echo
echo "# this site"
q "nighantu.$ZONE" CNAME
q "nighantu.$ZONE" A
echo
echo "# anything else that answers. Not exhaustive: only a GoDaddy zone-file export is."
for s in mail smtp imap pop webmail ftp cpanel autodiscover autoconfig \
         shop store blog cdn assets api app staging dev test \
         k1._domainkey k2._domainkey default._domainkey selector1._domainkey; do
  ans=$(dig +short "@$RESOLVER" "$s.$ZONE" 2>/dev/null | LC_ALL=C sort | paste -sd' ' -)
  [ -n "$ans" ] && printf '%-34s %-6s %s\n' "$s.$ZONE" "ANY" "$ans"
done
echo
echo "# reachability, which is what the records are for"
for u in "https://$ZONE/" "https://www.$ZONE/" "https://nighantu.$ZONE/"; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' --max-time 20 "$u" 2>/dev/null || echo "ERR")
  printf '%-34s %-6s HTTP %s\n' "$u" "GET" "$code"
done
