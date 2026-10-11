#!/usr/bin/env node
/**
 * Four root pages are authored in Markdown inside .astro files, which do not render Markdown.
 *
 * /corrections/, /editorial-standards/, /how-we-source/ and /reviewers/ put their whole body
 * straight inside <Page>...</Page> as Markdown. Astro treats that as text, so readers get:
 *
 *   - **Botanical misidentification.** Classical names map onto species inconsistently and
 *
 * literally, asterisks and leading hyphen included. Across the four there are 21 "## " headings
 * rendering as plain text, 62 stray asterisks and 26 Markdown bullets, and between them the four
 * pages contain ZERO real <h2> elements. So they have no document outline at all: nothing for a
 * reader to skim and nothing for an answer engine to use as structure.
 *
 * These are the site's trust pages. Editorial standards, how we source, the corrections policy and
 * the reviewer panel are where the project states what it will and will not do, and they were the
 * pages rendering as broken markup.
 *
 * WHAT MUST SURVIVE, which is why this is not a regex sweep. The bodies already contain inline HTML
 * (<a>, <cite>, <code>), a full <table> and a <style> block on the reviewers page, and live Astro
 * expressions: {rel('/how-we-source/')}, {STORE}, {reviewer.name}. All of it is passed through
 * untouched; only Markdown syntax is converted.
 *
 * AND THE GUARD IS THE POINT. After conversion the VISIBLE TEXT must be identical to before, once
 * Markdown markers are discounted. The script compares the two and refuses to write if a single
 * word moved, so it cannot quietly drop a sentence while tidying punctuation. Converting prose by
 * pattern is exactly where content gets lost, and this project has lost content that way before.
 *
 *   node scripts/fix-markdown-in-astro.mjs            report, with the guard result per page
 *   node scripts/fix-markdown-in-astro.mjs --write    apply
 */
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const PAGES = ['corrections', 'editorial-standards', 'how-we-source', 'reviewers'];

const inline = (s) => s
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>');

/**
 * Strip tags and Markdown markers, collapse whitespace: what a reader actually reads.
 *
 * Tags go to the EMPTY string, not to a space. Replacing them with a space made the guard reject
 * three of the four pages for differences it had created itself: "**...vernacular names**," becomes
 * "<strong>...vernacular names</strong>," and a space-for-tag substitution turns that into
 * "names , including" on one side and "names, including" on the other. Whitespace is collapsed
 * afterwards, so block tags still separate their contents via the newlines already in the source.
 */
const visible = (s) => s
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/^[ \t]*[-*]\s+/gm, ' ')
  .replace(/^[ \t]*#{2,4}\s+/gm, ' ')
  // Both emphasis markers, not just the double: how-we-source writes *pratinidhi dravya*, and
  // discounting only ** left the guard comparing "(*pratinidhi dravya*)" with "(pratinidhi dravya)".
  .replace(/\*/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function convert(body) {
  const lines = body.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2].trim())}</h${h[1].length}>`); i += 1; continue; }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && (/^[-*]\s+/.test(lines[i]) || (/^\s+\S/.test(lines[i]) && items.length))) {
        if (/^[-*]\s+/.test(lines[i])) items.push(lines[i].replace(/^[-*]\s+/, '').trim());
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i += 1;
      }
      out.push('<ul>');
      for (const it of items) out.push(`  <li>${inline(it)}</li>`);
      out.push('</ul>');
      continue;
    }

    // A raw HTML or Astro block: copy verbatim until the blank line that ends it.
    if (/^\s*[<{]/.test(line)) {
      while (i < lines.length && lines[i].trim()) { out.push(lines[i]); i += 1; }
      continue;
    }

    // Otherwise a paragraph: every line up to the next blank one.
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|[-*]\s)/.test(lines[i]) && !/^\s*[<{]/.test(lines[i])) {
      para.push(lines[i].trim()); i += 1;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

const results = [];
for (const name of PAGES) {
  const file = path.join('src', 'pages', `${name}.astro`);
  const src = fs.readFileSync(file, 'utf8');
  const open = src.indexOf('>\n', src.indexOf('<Page'));
  const close = src.lastIndexOf('</Page>');
  if (open === -1 || close === -1) { results.push({ name, refused: 'could not find the <Page> body' }); continue; }

  const head = src.slice(0, open + 2);
  const body = src.slice(open + 2, close);
  const tail = src.slice(close);

  const next = convert(body);
  const before = visible(body);
  const after = visible(next);
  if (before !== after) {
    // Show where they diverge so the failure is diagnosable rather than just reported.
    let k = 0;
    while (k < before.length && before[k] === after[k]) k += 1;
    results.push({
      name,
      refused: `visible text changed at character ${k}\n        was:  ...${before.slice(Math.max(0, k - 60), k + 60)}...\n        now:  ...${after.slice(Math.max(0, k - 60), k + 60)}...`,
    });
    continue;
  }

  results.push({
    name,
    h: (next.match(/<h[234]>/g) ?? []).length,
    ul: (next.match(/<ul>/g) ?? []).length,
    p: (next.match(/<p>/g) ?? []).length,
    chars: body.length,
  });
  if (WRITE) fs.writeFileSync(file, head + next + (next.endsWith('\n') ? '' : '\n') + tail);
}

const ok = results.filter((r) => !r.refused);
console.log(`${ok.length} pages converted, ${results.length - ok.length} refused.\n`);
for (const r of results) {
  if (r.refused) { console.log(`  REFUSED ${r.name}: ${r.refused}`); continue; }
  console.log(`  ${r.name.padEnd(22)} ${r.h} headings, ${r.ul} lists, ${r.p} paragraphs   (visible text identical)`);
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
