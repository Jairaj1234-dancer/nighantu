#!/usr/bin/env node
/**
 * One-time Search Console authorisation. Stores a refresh token and nothing else.
 *
 * WHY OAUTH AND NOT A SERVICE ACCOUNT. A service account needs to be added to the property as a
 * new user, which raised a question nobody could answer cleanly: searchAnalytics.query needs only
 * read permission, but reports have the URL Inspection API refusing service accounts below Owner,
 * and Google's own reference states no level. Authorising as the person who already has access
 * sidesteps it: the script can read exactly what they can read, no more. It also avoids
 * service-account key files, which many Cloud projects now block by org policy anyway, and a
 * refresh token scoped to webmasters.readonly is a narrower credential than a general-purpose
 * project identity.
 *
 * THE LOOPBACK FLOW, because the alternative is dead. Google removed the out-of-band
 * "copy this code" flow in 2022, so a desktop client authorises by redirecting to
 * http://127.0.0.1:<port>. A desktop client may use any loopback port without registering it, so
 * this picks one, serves exactly one request, and shuts down.
 *
 * WHAT IT WRITES. secrets/gsc-token.json, holding the refresh token. secrets/ is gitignored, which
 * matters more than usual here: THIS REPOSITORY IS PUBLIC, so a credential committed is a
 * credential published. Nothing here is ever printed to the terminal.
 *
 *   node scripts/gsc-auth.mjs          authorise, or report what is missing
 *   node scripts/gsc-auth.mjs --check  say whether a usable token is already stored
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const DIR = 'secrets';
const CLIENT = path.join(DIR, 'gsc-oauth.json');
const TOKEN = path.join(DIR, 'gsc-token.json');
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

if (process.argv.includes('--check')) {
  const ok = fs.existsSync(TOKEN) && JSON.parse(fs.readFileSync(TOKEN, 'utf8')).refresh_token;
  console.log(ok ? `A refresh token is stored in ${TOKEN}.` : `No token yet. Run: node ${process.argv[1]}`);
  process.exit(ok ? 0 : 1);
}

if (!fs.existsSync(CLIENT)) {
  console.error(`Missing ${CLIENT}.`);
  console.error('');
  console.error('Create it with the Desktop-app client ID and secret from Google Cloud:');
  console.error('   APIs & Services -> Credentials -> Create credentials -> OAuth client ID');
  console.error('   -> Application type: Desktop app');
  console.error('');
  console.error(`Then write ${CLIENT} containing exactly:`);
  console.error('   { "client_id": "....apps.googleusercontent.com", "client_secret": "...." }');
  console.error('');
  console.error('secrets/ is gitignored. Do not paste either value into a chat transcript.');
  process.exit(1);
}

const { client_id: clientId, client_secret: clientSecret } = JSON.parse(fs.readFileSync(CLIENT, 'utf8'));
if (!clientId || !clientSecret) {
  console.error(`${CLIENT} must contain client_id and client_secret.`);
  process.exit(1);
}

/**
 * PKCE, even though a client secret is present.
 *
 * The secret in a desktop client is not actually secret, which Google says plainly, so the
 * authorisation code is the thing worth protecting in transit. The verifier means a code
 * intercepted on the loopback redirect cannot be exchanged by anybody else.
 */
const verifier = crypto.randomBytes(48).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(16).toString('base64url');

const server = http.createServer();
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const { port } = server.address();
const redirect = `http://127.0.0.1:${port}`;

const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
auth.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirect,
  response_type: 'code',
  scope: SCOPE,
  // offline, or Google returns no refresh token and this becomes a one-hour credential.
  access_type: 'offline',
  prompt: 'consent',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  state,
}).toString();

console.log('Open this in the browser where you are signed in as the Search Console user:\n');
console.log(auth.toString());
console.log('\nWaiting for the redirect back to this machine...');
execFile('open', [auth.toString()], () => {}); // best effort; the printed URL is the fallback

const code = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timed out after 5 minutes')), 5 * 60 * 1000);
  server.on('request', (req, res) => {
    const url = new URL(req.url, redirect);
    const got = url.searchParams.get('code');
    const err = url.searchParams.get('error');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    if (url.searchParams.get('state') !== state) {
      res.end('State mismatch. Nothing was stored. Close this and run the command again.');
      clearTimeout(timer); reject(new Error('state mismatch')); return;
    }
    res.end(got ? 'Authorised. You can close this tab.' : `Authorisation failed: ${err}`);
    clearTimeout(timer);
    if (got) resolve(got); else reject(new Error(err || 'no code returned'));
  });
});
server.close();

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  }),
});
const body = await res.json();
if (!res.ok || !body.refresh_token) {
  // Never echo the response wholesale: it can carry an access token.
  console.error(`Token exchange failed: HTTP ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`);
  if (res.ok && !body.refresh_token) {
    console.error('Google returned no refresh token. That happens when the app was already');
    console.error('authorised; revoke it at myaccount.google.com/permissions and run this again.');
  }
  process.exit(1);
}

fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(TOKEN, `${JSON.stringify({ refresh_token: body.refresh_token, scope: SCOPE, obtained: new Date().toISOString().slice(0, 10) }, null, 1)}\n`);
console.log(`\nStored a refresh token in ${TOKEN} (gitignored). Nothing was printed.`);
console.log('Next: node scripts/gsc-coverage.mjs --properties   to list what this token can read.');
