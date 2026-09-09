#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  VAULT, OUT, ALLOWED_SECTIONS, THRESHOLDS, GLOSSARY_MAP,
  DUPLICATE_CANONICAL, FORBIDDEN_STRINGS, GLOSSARY_MAX_ENTRIES_PER_PAGE,
  MIN_PUBLISHABLE_WORDS, withBase,
} from './config.mjs';
import {
  walk, isDenied, identityOf, slugify, parseFrontmatter, splitSections,
  parseFacts, stripMarkup, dropLines, rewriteHeading, isLifted, isStrippedSection,
  wordCount, resolveWikilinks, dropUnresolvedListItems, redact, inferBotanical,
  stripSubsections, yamlValue,
} from './lib.mjs';
import { composeAnswer } from './answer.mjs';

const DRY = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > -1 ? Number(process.argv[i + 1]) : Infinity;
})();

if (!fs.existsSync(VAULT)) {
  console.error(`Vault not found: ${VAULT}`);
  process.exit(1);
}

// ---------------------------------------------------------------- stage 1: scan
const all = walk(VAULT);
const denied = [];
const candidates = [];

for (const rel of all) {
  const section = rel.split(path.sep)[0];
  if (!ALLOWED_SECTIONS.includes(section)) { denied.push([rel, 'section not allowed']); continue; }
  if (isDenied(rel)) { denied.push([rel, 'deny rule']); continue; }
  candidates.push({ rel, section });
}

// ---------------------------------------------------------------- stage 2: parse
const kindOf = (rel) => {
  if (rel.includes('Medical-Devices')) return 'device';
  if (rel.includes('Classical-Formulations')) return 'formulation';
  if (rel.startsWith('_Hub')) return 'hub';
  if (rel.includes('Classical-Texts')) return 'text';
  return 'herb';
};

const pages = [];
for (const c of candidates) {
  const raw = fs.readFileSync(path.join(VAULT, c.rel), 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const identity = identityOf(c.rel);
  const { lead, sections } = splitSections(body);
  const facts = parseFacts(lead);
  const words = wordCount(body);
  const segs = c.rel.split(path.sep);
  if (Array.isArray(data.aliases)) data.aliases = data.aliases.map(stripMarkup).filter(Boolean);
  if (Array.isArray(data.tags)) data.tags = data.tags.map(stripMarkup).filter(Boolean);

  pages.push({
    ...c,
    identity: stripMarkup(identity),
    slug: slugify(DUPLICATE_CANONICAL.get(identity) ?? identity),
    aliasOf: DUPLICATE_CANONICAL.has(identity) ? slugify(DUPLICATE_CANONICAL.get(identity)) : null,
    title: stripMarkup(data.title || identity).replace(/[_-]+/g, ' ').trim(),
    kind: kindOf(c.rel),
    category: segs[1] ?? '',
    subcategory: segs[2] ?? '',
    group: segs[3] ?? '',
    data, lead, sections, facts, words,
  });
}

// Drop duplicates that alias onto a canonical page we actually have.
const canonicalSlugs = new Set(pages.filter((p) => !p.aliasOf).map((p) => p.slug));
const aliases = [];
const kept = [];
for (const p of pages) {
  if (p.aliasOf && canonicalSlugs.has(p.aliasOf)) { aliases.push(p); continue; }
  kept.push(p);
}

// ------------------------------------------------- stage 3: standalone vs glossary
/**
 * Sections that survive transformation, with placeholders and lifted sections
 * removed. Word count is measured on this, not on the raw file: many formulation
 * pages are mostly "No PubMed data currently available" and read as substantial
 * until the placeholders come out.
 */
function renderSections(p) {
  const out = [];
  const sources = [];
  const productHints = [];
  for (const s of p.sections) {
    if (isStrippedSection(s.heading)) continue;
    if (isLifted(s.heading)) {
      if (s.heading === 'Data Sources') {
        for (const m of s.content.matchAll(/^[-*]\s+(.+)$/gm)) sources.push(stripMarkup(m[1]));
      } else if (s.heading === 'AgeAyurveda Product Applications') {
        for (const m of s.content.matchAll(/^###\s+(.+)$/gm)) productHints.push(stripMarkup(m[1]));
      }
      continue;
    }
    const content = stripSubsections(dropLines(s.content));
    if (!content || !/[A-Za-z]/.test(content.replace(/^#+.*$/gm, ''))) continue;
    out.push({ heading: rewriteHeading(s.heading), content });
  }
  const lead = dropLines(p.lead.replace(/^\*\*[^:*]+:\*\*.*$/gm, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { lead, rendered: out, sources, productHints };
}

for (const p of kept) {
  p.render = renderSections(p);
  const inferred = inferBotanical(p.render.rendered, p.facts);
  if (inferred && !p.facts['Botanical Name']) p.facts['Botanical Name'] = inferred;
  p.substance = wordCount(p.render.lead) + p.render.rendered.reduce((n, s) => n + wordCount(s.content), 0);
  p.standalone = p.substance >= (THRESHOLDS[p.kind] ?? 250);
}

const dropped = kept.filter((p) => p.substance < MIN_PUBLISHABLE_WORDS);
const publishable = kept.filter((p) => p.substance >= MIN_PUBLISHABLE_WORDS);
const standalone = publishable.filter((p) => p.standalone);
const rolled = publishable.filter((p) => !p.standalone);

// Deduplicate slugs among standalone pages.
const seen = new Map();
for (const p of standalone) {
  if (!seen.has(p.slug)) { seen.set(p.slug, p); continue; }
  const other = seen.get(p.slug);
  p.slug = `${p.slug}-${slugify(p.subcategory || p.category)}`;
  if (p.slug === other.slug) p.slug += '-2';
}

const urlOf = (p) => withBase(p.kind === 'hub' ? `/reference/${p.slug}/` : `/${p.kind}/${p.slug}/`);

// ------------------------------------------------- stage 4: link resolution index
const glossaryOf = (p) => {
  const g = GLOSSARY_MAP.find((g) => p.rel.startsWith(g.dir) && g.dir !== '_Hub');
  return g ?? GLOSSARY_MAP.find((g) => g.dir === '_Hub');
};

/**
 * Assign every rolled-up page to a glossary page and an anchor. Groups larger
 * than GLOSSARY_MAX_ENTRIES_PER_PAGE are split alphabetically so no single page
 * becomes a multi-hundred-kilobyte wall of text.
 */
const glossaryPages = [];
for (const g of GLOSSARY_MAP) {
  const entries = rolled
    .filter((p) => glossaryOf(p).slug === g.slug)
    .sort((a, b) => a.title.localeCompare(b.title, 'en'));
  if (!entries.length) continue;

  const partCount = Math.ceil(entries.length / GLOSSARY_MAX_ENTRIES_PER_PAGE);
  const perPart = Math.ceil(entries.length / partCount);
  for (let i = 0; i < partCount; i++) {
    const slice = entries.slice(i * perPart, (i + 1) * perPart);
    if (!slice.length) continue;
    const initial = (t) => (t.match(/[a-z0-9]/i)?.[0] ?? '#').toUpperCase();
    const from = initial(slice[0].title);
    const to = initial(slice[slice.length - 1].title);
    const range = from === to ? from : `${from}-${to}`;
    const slug = partCount === 1 ? g.slug : `${g.slug}-${slugify(range)}`;
    const page = { slug, group: g, range, part: i + 1, partCount, entries: slice };
    glossaryPages.push(page);
    for (const e of slice) {
      e.glossaryPage = page;
      e.anchor = slugify(e.identity);
      e.url = withBase(`/glossary/${slug}/#${e.anchor}`);
    }
  }
}

// Anchors must be unique within a page.
for (const page of glossaryPages) {
  const used = new Set();
  for (const e of page.entries) {
    let a = e.anchor || 'entry';
    let n = 2;
    while (used.has(a)) a = `${e.anchor}-${n++}`;
    used.add(a);
    e.anchor = a;
    e.url = withBase(`/glossary/${page.slug}/#${a}`);
  }
}

const linkIndex = new Map();
const addLink = (key, url) => {
  if (!key) return;
  const k = key.trim().toLowerCase();
  if (!linkIndex.has(k)) linkIndex.set(k, url);
};

for (const p of standalone) {
  addLink(p.identity, urlOf(p));
  addLink(p.title, urlOf(p));
  const al = p.data.aliases;
  if (Array.isArray(al)) al.forEach((a) => addLink(a, urlOf(p)));
}
for (const p of rolled) {
  if (!p.url) continue;
  addLink(p.identity, p.url);
  addLink(p.title, p.url);
  const al = p.data.aliases;
  if (Array.isArray(al)) al.forEach((a) => addLink(a, p.url));
}
for (const p of aliases) {
  const target = standalone.find((s) => s.slug === p.aliasOf);
  if (target) { addLink(p.identity, urlOf(target)); addLink(p.title, urlOf(target)); }
}

const resolver = (target) => linkIndex.get(target.trim().toLowerCase()) ?? null;

// ------------------------------------------------- stage 5: transform and emit
const PRODUCT_HINTS = new Map();


function transform(p) {
  const { lead, rendered, sources, productHints } = p.render;

  const answer = composeAnswer({
    title: p.title, kind: p.kind, facts: p.facts, sections: rendered, lead,
    group: p.group,
  });

  const bodyParts = [];
  if (lead) bodyParts.push(lead);
  for (const s of rendered) bodyParts.push(`## ${s.heading}\n\n${s.content}`);

  let raw = bodyParts.join('\n\n');
  if (p.kind === 'hub') raw = dropUnresolvedListItems(raw, resolver);
  const body = redact(resolveWikilinks(raw, resolver));
  if (productHints.length) PRODUCT_HINTS.set(p.slug, productHints);

  return { body, answer: redact(answer), sources, productHints };
}

function emit(p) {
  const t = transform(p);
  const fact = (k) => redact(stripMarkup(p.facts[k] ?? ''));
  const fm = [
    '---',
    `title: ${yamlValue(p.title)}`,
    `slug: ${yamlValue(p.slug)}`,
    `kind: ${yamlValue(p.kind)}`,
    `section: ${yamlValue(p.section)}`,
    `category: ${yamlValue(p.category)}`,
    `subcategory: ${yamlValue(p.subcategory)}`,
    `group: ${yamlValue(p.group)}`,
    `answer: ${yamlValue(t.answer)}`,
    `botanical: ${yamlValue(fact('Botanical Name'))}`,
    `family: ${yamlValue(fact('Family'))}`,
    `sanskrit: ${yamlValue(fact('Sanskrit Name'))}`,
    `ayurvedicCategory: ${yamlValue(redact(stripMarkup(p.facts['Ayurvedic Category'] ?? p.facts['Category'] ?? '')))}`,
    `whoStatus: ${yamlValue(fact('WHO/Pharmacopeia Status'))}`,
    `aliases: ${yamlValue((Array.isArray(p.data.aliases) ? p.data.aliases : []).map((x) => stripMarkup(x)))}`,
    `tags: ${yamlValue(Array.isArray(p.data.tags) ? p.data.tags : [])}`,
    `sources: ${yamlValue(t.sources.map((x) => redact(stripMarkup(x))))}`,
    `productHints: ${yamlValue(t.productHints)}`,
    `words: ${p.substance}`,
    `srcRel: ${yamlValue(p.rel)}`,
    '---',
    '',
  ].join('\n');

  const dir = path.join(OUT, p.kind === 'hub' ? 'reference' : p.kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${p.slug}.md`), fm + t.body + '\n');
}

function emitGlossaries() {
  const dir = path.join(OUT, 'glossary');
  fs.mkdirSync(dir, { recursive: true });
  for (const page of glossaryPages) {
    const rendered = page.entries.map((p) => {
      const t = transform(p);
      const text = t.body.replace(/^##\s+/gm, '#### ').trim();
      return { p, text };
    }).filter(({ text }) => {
      // An entry whose members were all cross-tradition renders as a bare
      // "N members in the catalogue" line. Drop it rather than ship a stub.
      const meaningful = text
        .replace(/^\*\d+ members? in the catalogue\*$/gm, '')
        .replace(/^\*Found in \d+ entries across the catalogue\*$/gm, '')
        .replace(/^####\s+.*$/gm, '')
        .trim();
      return meaningful.length > 0;
    });
    if (!rendered.length) continue;
    const body = rendered
      .map(({ p, text }) => `### ${p.title} {#${p.anchor}}\n\n${text}`)
      .join('\n\n');

    const label = page.partCount === 1
      ? page.group.title
      : `${page.group.title} (${page.range})`;
    const fm = [
      '---',
      `title: ${yamlValue(label)}`,
      `slug: ${yamlValue(page.slug)}`,
      'kind: "glossary"',
      `group: ${yamlValue(page.group.slug)}`,
      `groupTitle: ${yamlValue(page.group.title)}`,
      `range: ${yamlValue(page.range)}`,
      `part: ${page.part}`,
      `partCount: ${page.partCount}`,
      `entryCount: ${rendered.length}`,
      `answer: ${yamlValue(
        `${label} is a reference glossary of ${rendered.length} entries drawn from the Ayurvedic materia medica, each listing the herbs it occurs in and the compounds it commonly appears alongside.`,
      )}`,
      '---', '',
    ].join('\n');
    fs.writeFileSync(path.join(dir, `${page.slug}.md`), fm + body + '\n');
  }
}

// ---------------------------------------------------------------- run
const publishSet = standalone.slice(0, LIMIT);

if (DRY) {
  console.log(`VAULT           ${VAULT}`);
  console.log(`scanned         ${all.length} markdown files`);
  console.log(`denied          ${denied.length}`);
  console.log(`alias-merged    ${aliases.length}  (${aliases.map((a) => a.identity).join(', ') || 'none'})`);
  console.log(`standalone      ${standalone.length}`);
  console.log(`glossary-rolled ${rolled.length}`);
  console.log(`dropped (thin)  ${dropped.length}`);
  console.log('');
  const byKind = {};
  for (const p of standalone) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
  console.log('standalone by kind:', byKind);
  const denyReasons = {};
  for (const [, r] of denied) denyReasons[r] = (denyReasons[r] ?? 0) + 1;
  console.log('deny reasons:', denyReasons);
  const royale = denied.filter(([r]) => r.includes('Chyawanprash-Royale'));
  console.log(`\nChyawanprash-Royale files excluded: ${royale.length}`);
  const leaked = publishSet.filter((p) => FORBIDDEN_STRINGS.some((s) => fs.readFileSync(path.join(VAULT, p.rel), 'utf8').includes(s)));
  console.log(`pages containing forbidden strings: ${leaked.length}`);
  if (leaked.length) leaked.slice(0, 20).forEach((p) => console.log('   !', p.rel));
  process.exit(0);
}

fs.rmSync(OUT, { recursive: true, force: true });
for (const p of publishSet) emit(p);
emitGlossaries();

const manifest = {
  generatedAt: new Date().toISOString(),
  // Deliberately not the absolute vault path: this file is committed to a public
  // repo and the full path exposes the operator's home directory and machine layout.
  vault: path.basename(VAULT),
  counts: {
    scanned: all.length, denied: denied.length, aliases: aliases.length,
    standalone: publishSet.length, rolled: rolled.length, dropped: dropped.length,
  },
  productHints: Object.fromEntries(PRODUCT_HINTS),
  glossaryPages: glossaryPages.map((g) => ({
    slug: g.slug, title: g.group.title, range: g.range,
    part: g.part, partCount: g.partCount, entryCount: g.entries.length,
    url: withBase(`/glossary/${g.slug}/`),
  })),
  pages: publishSet.map((p) => ({ slug: p.slug, kind: p.kind, title: p.title, url: urlOf(p) })),
};
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/manifest.json', JSON.stringify(manifest, null, 2));

console.log(`ingested ${publishSet.length} standalone pages, ${rolled.length} glossary entries`);
console.log(`excluded ${denied.length} files (${denied.filter(([r]) => r.includes('Chyawanprash-Royale')).length} Chyawanprash-Royale)`);
