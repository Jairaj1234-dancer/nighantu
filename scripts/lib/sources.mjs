/**
 * Which sources may ground a safety statement, and how they rank.
 *
 * A safety warning is only as good as the thing it cites. Without an allowlist an
 * agent will happily ground "safe in pregnancy" in a supplement retailer's blog, and
 * the resulting sentence looks identical to a real one. So the pipeline cannot cite
 * anything not named here: the check runs on the resolved URL host, after redirects.
 *
 * Ranking exists because the sources genuinely disagree. A pharmacopoeial monograph
 * and a single case report are both real, and when they conflict the reader needs to
 * know which is which rather than getting an averaged sentence.
 */

/** Host -> {name, class}. Matched against the resolved host, suffix-wise. */
const ALLOWED = [
  // Regulatory and pharmacopoeial. The strongest class: these carry legal force
  // somewhere, and they state doses and contraindications as requirements.
  { host: 'iris.who.int',            name: 'WHO monographs on selected medicinal plants', cls: 'regulatory' },
  { host: 'apps.who.int',            name: 'WHO',                                          cls: 'regulatory' },
  { host: 'who.int',                 name: 'WHO',                                          cls: 'regulatory' },
  { host: 'ayush.gov.in',            name: 'Ministry of Ayush',                            cls: 'regulatory' },
  { host: 'pharmacopoeia.gov.in',    name: 'Indian Pharmacopoeia Commission',              cls: 'regulatory' },
  { host: 'ema.europa.eu',           name: 'European Medicines Agency',                    cls: 'regulatory' },
  { host: 'fda.gov',                 name: 'US Food and Drug Administration',              cls: 'regulatory' },

  // Institutional reviews. Curated, maintained, and explicitly graded, which is why
  // LiverTox is worth more here than its raw citation count suggests: it publishes a
  // likelihood scale (A to E) for hepatotoxicity rather than a yes/no.
  { host: 'ncbi.nlm.nih.gov',        name: 'NCBI Bookshelf (LiverTox and others)',         cls: 'institutional' },
  { host: 'nccih.nih.gov',           name: 'NIH National Center for Complementary and Integrative Health', cls: 'institutional' },
  { host: 'ods.od.nih.gov',          name: 'NIH Office of Dietary Supplements',            cls: 'institutional' },
  { host: 'mskcc.org',               name: 'Memorial Sloan Kettering About Herbs',         cls: 'institutional' },
  { host: 'medlineplus.gov',         name: 'MedlinePlus',                                  cls: 'institutional' },

  // Primary literature. Real, but a single paper is a single paper; the tier field
  // carries whether it is a meta-analysis or one case report.
  { host: 'pubmed.ncbi.nlm.nih.gov', name: 'PubMed',                                       cls: 'literature' },
  { host: 'pmc.ncbi.nlm.nih.gov',    name: 'PubMed Central',                               cls: 'literature' },
  { host: 'doi.org',                 name: 'DOI resolver',                                 cls: 'literature' },
];

export const SOURCE_CLASSES = ['regulatory', 'institutional', 'literature'];

/** Ranked strongest first, so a conflict resolves toward the more authoritative source. */
export const classRank = (cls) => {
  const i = SOURCE_CLASSES.indexOf(cls);
  return i === -1 ? SOURCE_CLASSES.length : i;
};

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

/**
 * Resolve a URL to its allowlist entry, or null.
 * Suffix match so pmc.ncbi.nlm.nih.gov and ncbi.nlm.nih.gov both work without
 * listing every subdomain, but "ncbi.nlm.nih.gov.evil.com" does not slip through:
 * the candidate must equal the host or be a dot-prefixed suffix of it.
 */
export function resolveSource(url) {
  const host = hostOf(url);
  if (!host) return null;
  for (const entry of ALLOWED) {
    if (host === entry.host || host.endsWith(`.${entry.host}`)) return entry;
  }
  return null;
}

export const isAllowedSource = (url) => resolveSource(url) !== null;

/** Every source on a record must resolve, or the record cannot be published. */
export function checkSources(sources = []) {
  const bad = [];
  for (const s of sources) {
    const url = typeof s === 'string' ? s : s?.url;
    if (!url || !isAllowedSource(url)) bad.push(url || '(no url)');
  }
  return { ok: bad.length === 0, rejected: bad };
}
