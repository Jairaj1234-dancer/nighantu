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

const AGGREGATOR = /(^|\.)(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|g\.page|practo\.com|justdial\.com|jsdl\.in|lybrate\.com|sulekha\.com|indiamart\.com|credihealth\.com|docprime\.com|healthfrog\.in|sehat\.com|quikr\.com|yelp\.[a-z.]+|facebook\.com|instagram\.com|wa\.me|whatsapp\.com)$/i;
const CURE = /\b(cure[ds]?|curing|healed|got rid of|gone|disappeared|reversed|treated my|treatment of|recovered from)\b/i;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const slug = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "+91 22 2345 6789", "022-23456789", "98200 12345" all become +91 and 10 digits, or null. */
function phone(raw) {
  let d = String(raw).replace(/[^\d+]/g, '').replace(/^\+?91/, '').replace(/^0/, '');
  if (!/^\d{10}$/.test(d)) return null;
  return /^[6-9]/.test(d) ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : `+91 ${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
}

const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR, { recursive: true }).filter((f) => String(f).endsWith('.json')).map((f) => path.join(DIR, String(f)))
  : [];
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

    const testimonials = (r.testimonials ?? []).filter((t) => t?.excerpt && t.url
      && !AGGREGATOR.test(host(t.url))
      && !CURE.test(t.excerpt) && !DISEASE_WORD.test(t.excerpt)
      && t.excerpt.split(/\s+/).length <= 45);
    const rec = {
      practiceName: r.practiceName.trim(),
      practitioners: docs.map((d) => ({ name: d.name.trim(), qualification: d.qualification ?? null, registration: d.registration?.number ? d.registration : null })),
      address: { line: a.line.trim(), locality: a.locality.trim(), city: a.city.trim(), pin: String(a.pin).replace(/\s/g, '') },
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
    const keys = [...rec.phone, `${slug(rec.practiceName)}|${rec.address.pin}`];
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
  let id = slug(p.practiceName) || 'practice';
  const scope = `${slug(p.address.city)}/${slug(p.address.locality)}`;
  let n = 1;
  while (used.has(`${scope}/${id}`)) id = `${slug(p.practiceName)}-${++n}`;
  used.add(`${scope}/${id}`);
  p.id = id;
}
practices.sort((a, b) => a.address.city.localeCompare(b.address.city) || a.address.locality.localeCompare(b.address.locality) || a.practiceName.localeCompare(b.practiceName));

console.log(`records read     ${seen} from ${files.length} file(s)`);
console.log(`refused          ${refused.length}`);
const reasons = {};
for (const r of refused) for (const w of r.why) { const k = w.replace(/sourced from .*/, 'sourced from an aggregator'); reasons[k] = (reasons[k] ?? 0) + 1; }
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`admitted         ${practices.length} practices after merging duplicates`);
if (DRY) process.exit(0);
const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
fs.writeFileSync(OUT, `${JSON.stringify({ ...prev, updatedAt: practices.map((p) => p.checkedOn).filter(Boolean).sort().pop() ?? '', practices }, null, 2)}\n`);
fs.writeFileSync(path.join(DIR, 'refused.json'), `${JSON.stringify(refused, null, 1)}\n`);
console.log(`wrote ${OUT}`);
