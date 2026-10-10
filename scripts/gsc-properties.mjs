#!/usr/bin/env node
/**
 * What can this credential read? The first thing to run, and the first thing to re-run on a 403.
 *
 * Search Console refuses an unauthorised property with the same shape of error whether the
 * credential is wrong, the property string is wrong, or the permission level is too low. Listing
 * what the token can actually see separates those three before any real query is written, which is
 * exactly what was missing when two signed-in Google accounts both returned "you don't have access
 * to this property" earlier and there was no way to tell which of the three it was.
 *
 *   node scripts/gsc-properties.mjs
 */
import { accessToken, properties, redactor } from './lib/gsc.mjs';

const redact = redactor();
let auth;
try {
  auth = await accessToken();
} catch (e) {
  if (e.noCredential) {
    console.error('No Search Console credential found under secrets/.');
    console.error('  service account: secrets/gsc-service-account.json  (the downloaded Cloud key)');
    console.error('  or OAuth:        node scripts/gsc-auth.mjs');
    process.exit(1);
  }
  console.error(`Could not get a token: ${redact(e.message)}`);
  process.exit(1);
}

console.log(`Authenticated as ${auth.identity} (via ${auth.via}).\n`);
try {
  const list = await properties(auth.token);
  if (!list.length) {
    console.log('This credential can read NO properties.');
    console.log('For a service account, add its client_email under Search Console');
    console.log('Settings, Users and permissions, Add user.');
    process.exit(1);
  }
  console.log(`${list.length} property(ies) readable:`);
  for (const p of list) console.log(`   ${p.level.padEnd(14)} ${p.url}`);
  console.log('\nPass the exact url string above to the coverage reader.');
} catch (e) {
  console.error(`Listing failed: ${redact(e.message)}`);
  process.exit(1);
}
