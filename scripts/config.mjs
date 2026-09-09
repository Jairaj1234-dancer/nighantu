import os from 'node:os';
import path from 'node:path';

export const VAULT = process.env.ATLAS_VAULT
  || path.join(os.homedir(), 'Desktop/Reference/Herb-Catalogue');

export const OUT = 'content';

// Public origin and path prefix. GitHub Pages project sites live under
// /<repo>/; a custom subdomain later means setting ATLAS_BASE back to "/".
export const SITE = process.env.ATLAS_SITE || 'https://jairaj1234-dancer.github.io';
export const BASE = (process.env.ATLAS_BASE || '/ayurveda-atlas').replace(/\/$/, '');
export const withBase = (p) => `${BASE}${p.startsWith('/') ? p : `/${p}`}`;

// Only these top-level vault sections may ever be published.
export const ALLOWED_SECTIONS = ['Ayurveda', '_Hub'];

// Hard deny. Any path containing one of these fragments is never published.
// Chyawanprash-Royale is an unreleased SKU: pricing, competitive matrix, launch
// roadmap, formulation SOP, regulatory dossier and packaging spec all live there.
export const DENY_PATH_FRAGMENTS = [
  'Chyawanprash-Royale',
  // Rasa-shastra metallic and mineral preparations. A consumer-facing reference
  // carrying detailed mercury and heavy-metal preparation monographs is an
  // unnecessary liability; revisit deliberately, not by default.
  'Toxic-Restricted-Herbs',
  'Manufacturing-RnD',
  'Traditional-Chinese-Medicine',
  'Other-Herbal-Traditions',
  'Nutraceuticals',
  '.obsidian',
  '/scripts/',
];

export const DENY_BASENAMES = [
  'INDEX.md', 'README.md', 'Home.md', 'Atlas.md',
  'Wikilink-Audit.md', 'Untitled.canvas',
  'Synergy-Network.md', 'Safety-Interactions.md',   // vault meta pages, not content
];

export const DENY_BASENAME_PATTERNS = [/MOC\.md$/i, /-DEVICES\.md$/, /-Suvarna\.md$/];

// Strings that must never appear in published content.
export const FORBIDDEN_STRINGS = [
  'COGS', 'MRP', 'landed cost', 'Competitive Matrix', 'Launch Roadmap',
  'Pricing-Economics', 'gross margin', 'Vaidya price',
];

// Standalone-page word thresholds by page kind. Below these, a page is rolled
// into a glossary instead of getting its own URL, so the site never ships
// doorway-shaped thin pages.
// Devices sit lower on purpose: the 45 instrument entries are a complete,
// coherent catalogue that exists nowhere else on the web, and they top out at
// 279 words by nature of the subject.
// Measured against the TRANSFORMED body, after placeholder lines such as
// "No PubMed data currently available" are dropped. Raw word count overstates
// substance badly on the formulation pages.
export const THRESHOLDS = {
  herb: 250,
  formulation: 220,
  device: 120,
  text: 200,
  hub: 200,
};

// Below this, a page has nothing worth publishing even as a glossary entry.
export const MIN_PUBLISHABLE_WORDS = 60;

// Lines that are placeholders rather than content.
export const PLACEHOLDER_PATTERNS = [
  /^\*No .*(data|information).*(available|catalogued).*\*$/i,
  /^\*Detailed .* not yet catalogued.*\*$/i,
  /^\*Further research recommended\.?\*$/i,
  /^\*Composition varies by specific preparation method\*$/i,
];

// The classical herb count for Chyawanprash is contested across sources
// (45 vs 50 vs 18 vs the counts embedded in the vault). Until it is settled,
// no page states a number for it.
export const CONTESTED_COUNT = {
  subject: /chyawanprash|chyavanprash/i,
  pattern: /\b\d{2}\s*(classical\s+)?herbs?\b/gi,
  replacement: 'a large number of classical herbs (sources differ on the exact count)',
};

// Redactions applied to every published line.
// Order matters: strip the name out of comma lists cleanly before falling back
// to the standalone replacement, so a manufacturer list does not end up reading
// "(Dabur, Kottakkal, a licensed Indian manufacturer)".
export const REDACTIONS = [
  { pattern: /\bShri Baidyanath Ayurved Bhawan\b/gi, replacement: 'a licensed Indian manufacturer' },
  { pattern: /,\s*Baidyanath\b/gi, replacement: '' },
  { pattern: /\bBaidyanath\s*,\s*/gi, replacement: '' },
  { pattern: /\(\s*Baidyanath\s*\)/gi, replacement: '' },
  { pattern: /\bBaidyanath\b/gi, replacement: 'a licensed Indian manufacturer' },
];

// Leaf filenames whose identity is the parent folder name, not the filename.
export const FOLDER_IDENTITY_FILES = new Set(['meta-analysis.md', 'device-info.md']);

// Sections lifted out of the body rather than rendered inline.
export const LIFTED_SECTIONS = new Set([
  'Data Sources',                    // becomes attribution metadata
  'AgeAyurveda Product Applications' // becomes product-map metadata
]);

// Question-form headings extract better in AI answers.
export const HEADING_REWRITES = new Map(Object.entries({
  'Modern Research': 'What does modern research show?',
  'Latest Clinical Research (2020-2026)': 'What do recent clinical trials show?',
  'Mechanisms of Action (Modern Research)': 'How does it work?',
  'Traditional Uses Validated by Modern Research': 'Which traditional uses are supported by research?',
  'Safety & Contraindications': 'Safety, contraindications and cautions',
  'Recent Safety Updates': 'Recent safety updates',
  'Phytochemical Profile': 'What is it made of?',
  'R&D / Formulation Data': 'Dosage forms and preparation',
  'Names & Identification': 'Names and identification',
  'Ayurvedic Pharmacology (Dravyaguna)': 'Ayurvedic pharmacology (Dravyaguna)',
  'Classical Text References': 'Where is it described in the classical texts?',
  'Classical References': 'Where is it described in the classical texts?',
  'Classical Reference': 'Where is it described in the classical texts?',
  'Traditional / Classical Uses': 'How is it used traditionally?',
  'Therapeutic Uses': 'How is it used traditionally?',
  'Regulatory Status': 'Regulatory status',
  'Modern Variants': 'Modern variants',
  'Traditional Materials': 'Traditional materials',
}));

// Lines dropped wholesale.
export const DROP_LINE_PATTERNS = [
  /^\*No PubMed data currently available.*\*$/i,
  /^\*No .* data (currently )?available.*\*$/i,
  /^> \*\*Disclaimer:\*\*/,           // site-wide disclaimer replaces the inline one
  /^\*Part of the .*AgeAyurveda.*\*$/,  // internal vault footers
  /^(?:-{3,}|\*{3,}|_{3,})$/,           // horizontal rules
];

// Hub pages cross-reference traditions the site does not publish. Dropping these
// sections stops the private TCM, global-herbalism, nutraceutical and
// manufacturing trees leaking out through the compound and family hubs.
// H3 subsections stripped from every page. Manufacturing method detail is the
// same class of process IP the private Manufacturing-R&D tree was held back for;
// publishing it inside a herb monograph would be an accidental route out.
export const STRIP_SUBSECTION_PATTERNS = [
  /^Manufacturing (Notes|Process|Considerations)$/i,
  /^Process Optimi[sz]ation$/i,
  /^Scale-?up Notes$/i,
];

export const STRIP_SECTION_PATTERNS = [
  /^(TCM|Global|Nutraceutical|Manufacturing|Unani|Siddha|Kampo|Western)(\s*\(\d+\))?(\s+Approach)?$/i,
];

export const GLOSSARY_MAP = [
  { slug: 'compounds',      title: 'Phytochemical compounds',  dir: '_Hub/Compounds' },
  { slug: 'pharmacology',   title: 'Pharmacology terms',       dir: '_Hub/Pharmacology' },
  { slug: 'plant-families', title: 'Plant families',           dir: '_Hub/Families' },
  { slug: 'body-systems',   title: 'Body systems and doshas',  dir: '_Hub/Body-Systems' },
  { slug: 'concepts',       title: 'Ayurvedic concepts',       dir: '_Hub' },
];

// A glossary group larger than this is split into alphabetical parts so no
// single page becomes an unreadable, slow-to-crawl wall of text.
export const GLOSSARY_MAX_ENTRIES_PER_PAGE = 80;

// Near-duplicate pages: value is the canonical slug.
export const DUPLICATE_CANONICAL = new Map(Object.entries({
  'Bruhati': 'Brihati',
  'Giloy': 'Guduchi',
}));
