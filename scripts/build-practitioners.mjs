#!/usr/bin/env node
/**
 * Build src/data/practitioners.json from the collected records, and refuse anything that does not meet
 * the admission rule.
 *
 * The collection is done by hand and by research agents, and both make mistakes, so nothing they
 * return is trusted as admitted. Every record is checked again here:
 *
 *   - all four fields present: a named practitioner, the practice name, a full address with a six-digit
 *     PIN, and at least one phone number that parses as an Indian number;
 *   - each of the four carries a source URL, and no source is a map, booking or review platform. Those
 *     platforms' terms forbid building a directory from their data, and their numbers are not the
 *     practice's own publication;
 *   - testimonials come from the practice's own site and do not claim to treat or cure a disease.
 *
 * Duplicates are merged across collection files on the phone number or on name and PIN, because two
 * zones can find the same practice from either side of their boundary.
 *
 *   node scripts/build-practitioners.mjs [--dir measurement/practitioners] [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { DISEASE_WORD } from './lib/answer-safety.mjs';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i < 0 ? d : process.argv[i + 1]; };
const DIR = arg('--dir', path.join('measurement', 'practitioners'));
const DRY = process.argv.includes('--dry');
const OUT = path.join('src', 'data', 'practitioners.json');

const AGGREGATOR = /(^|\.)(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|g\.page|practo\.com|justdial\.com|jsdl\.in|lybrate\.com|sulekha\.com|indiamart\.com|credihealth\.com|docprime\.com|healthfrog\.in|sehat\.com|quikr\.com|yelp\.[a-z.]+|facebook\.com|instagram\.com|wa\.me|whatsapp\.com|cghshospitals\.com|gconnect\.in|staffnews\.in|uway\.health|drlogy\.com|docindia\.org|bajajfinservhealth\.in|latrexa\.com|timesmed\.com|connectto\.in)$/i;
const CURE = /\b(cure[ds]?|curing|healed|got rid of|gone|disappeared|reversed|treated my|treatment of|recovered from)\b/i;
/**
 * A testimonial may say what the visit was like, not what it did to the patient's health. Outcome
 * language ("helped me recover", "transformative for my health", "the deepest sleep in years") and a
 * named condition beside the treatment ("visited for cervical spondylosis") read as claims of effect,
 * which this site does not make in its own voice and does not republish in anyone else's.
 */
const OUTCOME = /\b(recover\w*|treat(s|ed)? you|prevent\w*|transformative|transformed|revitali[sz]\w*|rejuvenat\w*|for my health|for our health|feel(ing)? better|felt better|sleep|sorrow|relief|reliev\w*|improv\w*|pain|spondyl\w*|arthrit\w*|diabet\w*|thyroid|bp\b|pressure|weight|piles|fistula|detox\w*|healthy|healthier|effective|solutions?|healing|de-?stress\w*|stress)\b/i;
/**
 * The locality a page is grouped under: the standard area a reader searches by ("Thane West"), not
 * the sub-area a clinic happens to print ("Vishnu Nagar, Naupada, Thane West"). The sub-area is kept,
 * moved into the street line, so the address on the page is unchanged.
 */
const LOCALITY_NAME = { 'Chembur / Govandi': 'Govandi', 'Sion West': 'Sion' };
function locality(raw, city, line) {
  // A bracketed aside ("Anchepalya (Kumbalgodu, beyond Kengeri)") is an address detail, not the area.
  const l = (LOCALITY_NAME[raw.trim()] ?? raw.trim()).replace(/\s*\([^)]*\)?/g, '').trim();
  const parts = l.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return { locality: l, line };
  const last = parts[parts.length - 1];
  const area = last.toLowerCase() === city.toLowerCase() ? parts[0] : last;
  const sub = parts.filter((x) => x !== area && x.toLowerCase() !== city.toLowerCase());
  const missing = sub.filter((x) => !line.toLowerCase().includes(x.toLowerCase()));
  return { locality: area, line: missing.length ? `${line}, ${missing.join(', ')}` : line };
}
/** A URL segment of at most 60 characters, cut at a word boundary. */
const shortSlug = (s) => { const x = slug(s); if (x.length <= 60) return x; const c = x.slice(0, 61); return c.slice(0, c.lastIndexOf('-')) || x.slice(0, 60); };
const CITY_NAME = { 'New Delhi': 'Delhi', 'Mira Bhayandar (Thane district)': 'Mira Bhayandar', 'Mira Road': 'Mira Bhayandar', 'Bhayandar': 'Mira Bhayandar' };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const slug = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** STD codes that are two digits long (the metros); any other landline code is three digits unless listed in STD4. */
const STD2 = new Set(['11', '20', '22', '33', '40', '44', '79', '80']);
const STD4 = new Set(['4885']);
/**
 * Landline codes that begin with 6 to 9, the digits mobile numbers begin with. Ten digits alone cannot
 * tell "80 2345 6789" (Bengaluru) from a mobile, so these are recognised only when the source writes the
 * code as its own group or with a trunk 0, never inferred from the digits.
 */
const STD_6_9 = new Set(['79', '80', '612', '651', '661', '674', '712', '731', '755', '761', '820', '821', '824', '831', '832', '836', '863', '866', '891']);

const stdLength = (d) => (STD2.has(d.slice(0, 2)) ? 2 : STD4.has(d.slice(0, 4)) ? 4 : 3);
const landline = (d, n) => (n === 4 ? `+91 ${d.slice(0, 4)} ${d.slice(4)}` : `+91 ${d.slice(0, n)} ${d.slice(n, n + 4 - (n === 3 ? 1 : 0))} ${d.slice(n + 4 - (n === 3 ? 1 : 0))}`);

/** "+91 22 2345 6789", "0471-2223542", "0832 2918205", "98200 12345" all become +91 and 10 digits, or null. */
function phone(raw) {
  const text = String(raw).trim().replace(/^\+?\s*91[\s-]+|^\+91(?=0)/, '');
  let d = String(raw).replace(/[^\d+]/g, '').replace(/^\+?91/, '');
  const trunk = d.startsWith('0');
  d = d.replace(/^0/, '');
  if (!/^\d{10}$/.test(d)) return null;
  const group = (text.replace(/^0/, '').match(/^\(?(\d{2,4})[)\s-]/) ?? [])[1];
  if (/^[6-9]/.test(d)) {
    if (trunk) return landline(d, stdLength(d));
    if (group && STD_6_9.has(group) && d.startsWith(group)) return landline(d, group.length);
    return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  }
  return landline(d, stdLength(d));
}

const SKIP = new Set(['hold.json', 'refused.json']);
const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR, { recursive: true }).filter((f) => String(f).endsWith('.json') && !SKIP.has(path.basename(String(f)))).map((f) => path.join(DIR, String(f)))
  : [];
/**
 * Listings that pass every check here but are held out: the phone or the practitioner could not be
 * found on the cited page when it was re-fetched, or the listing waits on an editorial decision.
 * Matched on practice name and locality. The file lives with the collection, at <dir>/hold.json.
 */
const HOLD_FILE = [path.join(DIR, 'hold.json'), path.join(path.dirname(DIR), 'hold.json')].find((f) => fs.existsSync(f));
const HELD = new Set((HOLD_FILE ? JSON.parse(fs.readFileSync(HOLD_FILE, 'utf8')).hold : []).map((h) => `${h.practiceName}|${h.locality}`));
let held = 0;
const refused = [];
const kept = new Map();
let seen = 0;
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of j.admitted ?? []) {
    seen += 1;
    const why = [];
    const docs = (r.practitioners ?? []).filter((d) => d?.name && /\S/.test(d.name));
    if (!docs.length) why.push('no named practitioner');
    if (!r.practiceName?.trim()) why.push('no practice name');
    const a = r.address ?? {};
    if (!a.line?.trim() || !a.locality?.trim() || !a.city?.trim()) why.push('incomplete address');
    if (!/^\d{6}$/.test(String(a.pin ?? '').replace(/\s/g, ''))) why.push('no six-digit PIN');
    const phones = [...new Set((r.phone ?? []).map(phone).filter(Boolean))];
    if (!phones.length) why.push('no valid phone');
    const src = r.sources ?? {};
    for (const k of ['practiceName', 'practitioners', 'address', 'phone']) {
      if (!src[k] || !/^https?:\/\//.test(src[k])) why.push(`no source for ${k}`);
      else if (AGGREGATOR.test(host(src[k]))) why.push(`${k} sourced from ${host(src[k])}`);
    }
    if (why.length) { refused.push({ file: path.basename(f), practiceName: r.practiceName, why }); continue; }
    // Held by name with the locality either as collected or as normalised for the page.
    if ([a.locality?.trim(), locality(a.locality ?? '', CITY_NAME[a.city?.trim()] ?? a.city?.trim() ?? '', a.line ?? '').locality].some((l) => HELD.has(`${r.practiceName?.trim()}|${l}`))) { held += 1; continue; }

    const testimonials = (r.testimonials ?? []).filter((t) => t?.excerpt && t.url
      && !AGGREGATOR.test(host(t.url))
      && !CURE.test(t.excerpt) && !DISEASE_WORD.test(t.excerpt) && !OUTCOME.test(t.excerpt)
      && t.excerpt.split(/\s+/).length <= 45);
    const rec = {
      practiceName: r.practiceName.trim(),
      practitioners: docs.map((d) => ({ name: d.name.trim(), qualification: d.qualification ?? null, registration: d.registration?.number ? d.registration : null })),
      address: (() => { const city = CITY_NAME[a.city.trim()] ?? a.city.trim(); const loc = locality(a.locality, city, a.line.trim()); return { line: loc.line, locality: loc.locality, city, pin: String(a.pin).replace(/\s/g, ''), ...(a.state ? { state: String(a.state).trim() } : {}) }; })(),
      phone: phones,
      website: r.website || null,
      email: r.email || null,
      hours: r.hours || null,
      services: (r.services ?? []).filter((s) => !DISEASE_WORD.test(s)),
      sources: { practiceName: src.practiceName, practitioners: src.practitioners, address: src.address, phone: src.phone },
      testimonials,
      reviewLinks: (r.reviewLinks ?? []).filter((x) => /^https?:\/\//.test(x?.url ?? '')),
      checkedOn: j.collectedOn ?? null,
    };
    // A phone alone is not a practice: chains publish one central number for branches in different
    // cities, and merging on it swallowed a Mumbai branch into a Bengaluru one. Same number AND same
    // PIN, or same name and PIN, is the same practice.
    const keys = [...rec.phone.map((ph) => `${ph}|${rec.address.pin}`), `${slug(rec.practiceName)}|${rec.address.pin}`];
    const dup = keys.map((k) => kept.get(k)).find(Boolean);
    if (dup) {
      // Same practice found twice: keep the record with more detail, union the doctors and testimonials.
      const names = new Set(dup.practitioners.map((d) => d.name.toLowerCase()));
      for (const d of rec.practitioners) if (!names.has(d.name.toLowerCase())) dup.practitioners.push(d);
      const ex = new Set(dup.testimonials.map((t) => t.excerpt));
      for (const t of rec.testimonials) if (!ex.has(t.excerpt)) dup.testimonials.push(t);
      for (const k of keys) kept.set(k, dup);
      continue;
    }
    for (const k of keys) kept.set(k, rec);
  }
}
const practices = [...new Set(kept.values())];
// Ids are unique within a locality, which is all the URL needs.
const used = new Set();
for (const p of practices) {
  let id = shortSlug(p.practiceName) || 'practice';
  const scope = `${slug(p.address.city)}/${slug(p.address.locality)}`;
  let n = 1;
  while (used.has(`${scope}/${id}`)) id = `${shortSlug(p.practiceName)}-${++n}`;
  used.add(`${scope}/${id}`);
  p.id = id;
}
practices.sort((a, b) => a.address.city.localeCompare(b.address.city) || a.address.locality.localeCompare(b.address.locality) || a.practiceName.localeCompare(b.practiceName));

console.log(`records read     ${seen} from ${files.length} file(s)`);
console.log(`refused          ${refused.length}`);
const reasons = {};
for (const r of refused) for (const w of r.why) { const k = w.replace(/sourced from .*/, 'sourced from an aggregator'); reasons[k] = (reasons[k] ?? 0) + 1; }
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`held             ${held} (see hold.json)`);
console.log(`admitted         ${practices.length} practices after merging duplicates`);
if (DRY) process.exit(0);
const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
fs.writeFileSync(OUT, `${JSON.stringify({ ...prev, updatedAt: practices.map((p) => p.checkedOn).filter(Boolean).sort().pop() ?? '', practices }, null, 2)}\n`);
fs.writeFileSync(path.join(DIR, 'refused.json'), `${JSON.stringify(refused, null, 1)}\n`);
console.log(`wrote ${OUT}`);
