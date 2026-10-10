/**
 * Search Console access token, from whichever credential is present.
 *
 * TWO SHAPES, DELIBERATELY. A service-account key is less work when you already have one, and
 * needs the account added to the property as a user. An OAuth refresh token needs no new grant,
 * because it reads as the person who already has access, and it sidesteps the question nobody could
 * answer cleanly: searchAnalytics.query needs only read permission, but the URL Inspection API is
 * reported to refuse service accounts below Owner and Google's own reference states no level. So
 * the service account is tried first and the refresh token is the fallback if Inspection 403s.
 *
 * Both live under secrets/, which is gitignored. THIS REPOSITORY IS PUBLIC: a credential committed
 * here is a credential published.
 *
 *   secrets/gsc-service-account.json   the downloaded Cloud key, unmodified
 *   secrets/gsc-token.json             written by scripts/gsc-auth.mjs
 *   secrets/gsc-oauth.json             the desktop client id and secret
 *
 * Nothing in here prints a credential. redactor() is exported so callers cannot accidentally log
 * one either.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'secrets';
const SA = path.join(DIR, 'gsc-service-account.json');
const TOKEN = path.join(DIR, 'gsc-token.json');
const CLIENT = path.join(DIR, 'gsc-oauth.json');
export const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);

/** Strip every secret this process holds from anything bound for a log or a file. */
export function redactor() {
  const secrets = [];
  const sa = read(SA);
  if (sa?.private_key) secrets.push(sa.private_key);
  if (sa?.private_key_id) secrets.push(sa.private_key_id);
  const t = read(TOKEN);
  if (t?.refresh_token) secrets.push(t.refresh_token);
  const c = read(CLIENT);
  if (c?.client_secret) secrets.push(c.client_secret);
  const live = secrets.filter(Boolean);
  return (s) => live.reduce((acc, v) => acc.replaceAll(v, '[REDACTED]'), String(s ?? ''));
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * A signed JWT assertion, which is how a service account authenticates.
 *
 * No library: Node signs RS256 directly. The private key in the downloaded JSON carries literal
 * \n escapes when the file has been through a shell or an editor, so they are unescaped before
 * signing. Getting that wrong produces a signature error that reads like a permissions problem,
 * which is the kind of misdiagnosis this project has already published once.
 */
function assertion(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const key = String(sa.private_key).replace(/\\n/g, '\n');
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).end().sign(key);
  return `${header}.${claims}.${b64url(sig)}`;
}

/**
 * An access token, and which credential produced it.
 *
 * Returns { token, via } so a caller can say in its own output whether it is reading as the
 * service account or as the user. That matters when a 403 arrives: the two have different
 * permissions and the fix differs.
 */
export async function accessToken({ prefer = 'service-account' } = {}) {
  const sa = read(SA);
  const tok = read(TOKEN);
  const client = read(CLIENT);
  const order = prefer === 'oauth' ? ['oauth', 'service-account'] : ['service-account', 'oauth'];

  const errors = [];
  for (const via of order) {
    try {
      if (via === 'service-account') {
        if (!sa?.client_email || !sa?.private_key) continue;
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: assertion(sa),
          }),
        });
        const body = await res.json();
        if (!res.ok || !body.access_token) {
          errors.push(`service-account: HTTP ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim());
          continue;
        }
        return { token: body.access_token, via, identity: sa.client_email };
      }
      if (!tok?.refresh_token || !client?.client_id) continue;
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tok.refresh_token,
          client_id: client.client_id,
          client_secret: client.client_secret,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.access_token) {
        errors.push(`oauth: HTTP ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim());
        continue;
      }
      return { token: body.access_token, via, identity: 'the authorised user' };
    } catch (e) {
      errors.push(`${via}: ${e.message}`);
    }
  }

  const err = new Error(errors.length ? errors.join('; ') : 'no credential found');
  err.noCredential = !errors.length;
  throw err;
}

/** Which properties this credential can actually read. The first thing to check on a 403. */
export async function properties(token) {
  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${body.error?.message ?? ''}`);
  return (body.siteEntry ?? []).map((s) => ({ url: s.siteUrl, level: s.permissionLevel }));
}
