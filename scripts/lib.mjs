import fs from 'node:fs';
import path from 'node:path';
import {
  FOLDER_IDENTITY_FILES, DENY_PATH_FRAGMENTS, DENY_BASENAMES,
  DENY_BASENAME_PATTERNS, DROP_LINE_PATTERNS, HEADING_REWRITES, LIFTED_SECTIONS,
  STRIP_SECTION_PATTERNS, STRIP_SUBSECTION_PATTERNS, PLACEHOLDER_PATTERNS,
  REDACTIONS, CONTESTED_COUNT,
} from './config.mjs';

export function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else if (e.name.endsWith('.md')) out.push(path.relative(base, p));
  }
  return out;
}

export function isDenied(rel) {
  const norm = '/' + rel.replace(/\\/g, '/');
  if (DENY_PATH_FRAGMENTS.some((f) => norm.includes(f))) return true;
  const base = path.basename(rel);
  if (DENY_BASENAMES.includes(base)) return true;
  if (DENY_BASENAME_PATTERNS.some((r) => r.test(base))) return true;
  return false;
}

/** Page identity is the parent folder for leaf files, else the filename. */
export function identityOf(rel) {
  const base = path.basename(rel);
  return FOLDER_IDENTITY_FILES.has(base)
    ? path.basename(path.dirname(rel))
    : base.replace(/\.md$/, '');
}

export function slugify(s) {
  return String(s)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) {
      v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    data[kv[1]] = v;
  }
  return { data, body: text.slice(m[0].length) };
}

/** Split a markdown body into { lead, sections: [{ heading, content }] }. */
export function splitSections(body) {
  const lines = body.split(/\r?\n/);
  const sections = [];
  let lead = [];
  let cur = null;
  for (const line of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      if (cur) sections.push(cur);
      cur = { heading: h[1], lines: [] };
    } else if (cur) cur.lines.push(line);
    else lead.push(line);
  }
  if (cur) sections.push(cur);
  return {
    lead: lead.join('\n').replace(/^#\s+.*$/m, '').trim(),
    sections: sections.map((s) => ({ heading: s.heading, content: s.lines.join('\n').trim() })),
  };
}

/** Leading "**Key:** value" lines from the lead block. */
export function parseFacts(lead) {
  const facts = {};
  for (const m of lead.matchAll(/^\*\*([^:*]+):\*\*\s*(.+)$/gm)) {
    facts[m[1].trim()] = m[2].trim();
  }
  return facts;
}

export function stripMarkup(s) {
  return String(s)
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    // malformed and nested vault links, e.g. "Ghrita|Amritaprasha Ghrita]]"
    .replace(/\[{2,}([^\[\]|]*)(?:\|([^\[\]]*))?\]{0,2}/g, (_a, t, l) => (l ?? t))
    .replace(/([^\s|]*)\|([^|\]]*)\]\]/g, '$2')
    .replace(/\]{2,}/g, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function redact(text) {
  let out = text;
  for (const { pattern, replacement } of REDACTIONS) out = out.replace(pattern, replacement);
  // Line-scoped so a herb count on an unrelated page is left alone.
  out = out
    .split('\n')
    .map((line) => (CONTESTED_COUNT.subject.test(line)
      ? line.replace(CONTESTED_COUNT.pattern, CONTESTED_COUNT.replacement)
      : line))
    .join('\n');
  return out;
}

export function dropLines(text) {
  return text
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !DROP_LINE_PATTERNS.some((r) => r.test(t))
        && !PLACEHOLDER_PATTERNS.some((r) => r.test(t));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function rewriteHeading(h) {
  return HEADING_REWRITES.get(h) ?? h;
}

export function isLifted(h) {
  return LIFTED_SECTIONS.has(h);
}

/** Remove whole "### Heading" blocks whose heading matches a strip pattern. */
export function stripSubsections(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const h = /^(#{3,6})\s+(.+?)\s*$/.exec(line);
    if (h) {
      skipping = STRIP_SUBSECTION_PATTERNS.some((r) => r.test(h[2]));
      if (skipping) continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Sections that reference vault trees this site does not publish. */
export function isStrippedSection(h) {
  return STRIP_SECTION_PATTERNS.some((r) => r.test(h.trim()));
}

/**
 * Many monographs state the binomial only in the Names table or inline, not in
 * the bold facts block. Without this, real plants describe themselves as an
 * unnamed "substance".
 */
export function inferBotanical(sections, facts) {
  if (facts['Botanical Name']) return stripMarkup(facts['Botanical Name']);
  const all = sections.map((x) => x.content).join('\n');

  const names = sections.find((x) => /Names and identification|Names & Identification/i.test(x.heading));
  if (names) {
    const row = /^\|\s*(?:Latin\/Botanical|Botanical|Latin)\s*\|\s*([^|]+?)\s*\|/im.exec(names.content);
    if (row) {
      const v = stripMarkup(row[1]);
      if (/^[A-Z][a-z]+\s+[a-z-]{3,}/.test(v)) return v;
    }
  }

  const italic = /(?:\*|_)([A-Z][a-z]+\s+[a-z-]{4,}(?:\s+(?:L\.|[A-Z][a-z]+\.?))?)(?:\*|_)/.exec(all);
  if (italic) return italic[1].trim();

  // No frequency-based guessing beyond this point. A wrong binomial would flow
  // into the key-facts table and the JSON-LD; an empty field is the safer miss.
  return '';
}

export function wordCount(s) {
  return (s.match(/\S+/g) || []).length;
}

/**
 * Resolve [[wikilinks]]. `resolver(target)` returns a URL or null.
 * Unresolvable links render as plain text so no broken link is ever emitted.
 */
export function resolveWikilinks(text, resolver) {
  const out = text.replace(/\[\[([^\[\]]+)\]\]/g, (_all, inner) => {
    const [rawTarget, rawLabel] = inner.split('|');
    const target = rawTarget.trim();
    const label = (rawLabel ?? rawTarget).trim();
    const url = resolver(target);
    return url ? `[${label}](${url})` : label;
  });
  // The vault contains malformed links ("[[[Coriander", unbalanced pairs). Nothing
  // resembling wikilink syntax may reach the published HTML, so sanitise what is left.
  return out
    .replace(/\[{2,}([^\[\]|]*)(?:\|([^\[\]]*))?\]{0,2}/g, (_a, t, l) => (l ?? t))
    .replace(/\]{2,}/g, '');
}

/**
 * Hub pages list members across every tradition in the vault, including the trees
 * this site does not publish. A list item whose link target is not published is
 * removed outright rather than degraded to plain text, so nothing leaks by name.
 */
export function dropUnresolvedListItems(text, resolver) {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      if (!/^\s*[-*]\s/.test(line)) return true;
      const targets = [...line.matchAll(/\[\[([^\[\]|]+)/g)].map((m) => m[1].trim());
      if (!targets.length) return true;
      return targets.some((t) => resolver(t));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function yamlValue(v) {
  if (Array.isArray(v)) return `[${v.map((x) => JSON.stringify(String(x))).join(', ')}]`;
  return JSON.stringify(String(v ?? ''));
}
