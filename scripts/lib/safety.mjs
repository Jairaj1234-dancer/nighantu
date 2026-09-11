/**
 * Safety records: shape, validation, and the rule that a claim without a usable
 * source is not a claim.
 *
 * 24 of 504 herb pages carry any safety content at all. The vault has a Safety
 * heading on 456 files, but the body is almost always the placeholder "Detailed
 * safety data not yet catalogued for this herb", which ingest strips. So the site
 * currently answers "is this safe in pregnancy" with silence on 480 pages.
 *
 * Silence is the specific failure this module exists to prevent. A record may say
 * "no authoritative source establishes this" and publish that sentence; it may not
 * omit the question. Everything else here is machinery for making sure the sentences
 * that do publish are traceable to something real.
 *
 * Validation is deliberately structural rather than advisory. A record that fails
 * cannot be rendered, because the failure modes we have already hit on this project
 * (paraphrased citations that matched no paper, binomials inferred from an
 * ingredient list) all looked completely plausible in prose.
 */
import { checkSources, resolveSource, classRank } from './sources.mjs';

export const SEVERITIES = ['contraindicated', 'major', 'moderate', 'minor', 'theoretical'];
export const STATUSES = ['avoid', 'caution', 'insufficient-data', 'no-known-concern'];

/**
 * Whether a statement is about THIS preparation or about the class it belongs to.
 *
 * This distinction was forced by the data rather than designed up front. Most
 * individual bhasmas have no published literature at all, but the class of Ayurvedic
 * metallic preparations has a great deal, including the JAMA and MMWR contamination
 * work. A record saying "nothing is published about this specific preparation, and
 * here is what is documented about the class it belongs to" is the most useful and
 * most honest page we can put in front of someone. The first draft of this schema
 * treated that state as a contradiction and refused it.
 */
export const SCOPES = ['preparation-specific', 'class-level'];

/** Kinds where an absent heavy-metal statement is itself a defect, not a gap. */
export const HEAVY_METAL_REQUIRED = new Set([
  'Mineral-Metal-Preparations',
  'Rasa-Shastra-Alchemical-Preparations',
  'Salts-Minerals-Metals',
]);

/**
 * Phrasings that turn a safety note into a therapeutic claim. Safety text is the
 * easiest place to drift into "treats X" while describing what a herb is used for,
 * and this is a regulated line for Age Ayurveda specifically.
 */
const CLAIM_PATTERNS = [
  /\b(cures?|curing|heals?|healing)\b/i,
  /\btreats?\b/i,
  /\b(prevents?|preventing)\s+(cancer|diabetes|covid|alzheimer)/i,
  /\balternative to (medication|drugs|treatment)\b/i,
  /\breplaces? (your )?(medication|prescription)\b/i,
  /\bno side effects\b/i,
  /\bcompletely safe\b/i,
  /\b100% safe\b/i,
];

export const emptyRecord = (slug, title = '') => ({
  slug,
  title,
  botanical: '',
  contraindications: [],
  pregnancy: null,
  lactation: null,
  interactions: [],
  adverseEffects: [],
  doseLimits: null,
  heavyMetals: null,
  sources: [],
  insufficientData: false,
  insufficientReason: '',
});

const asArray = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** Every statement carries sourceIds; they must all resolve to a listed source. */
function collectRefs(rec) {
  const refs = [];
  const push = (node, where) => {
    if (!node) return;
    for (const id of asArray(node.sourceIds)) refs.push({ id, where });
  };
  asArray(rec.contraindications).forEach((c, i) => push(c, `contraindications[${i}]`));
  asArray(rec.interactions).forEach((c, i) => push(c, `interactions[${i}]`));
  asArray(rec.adverseEffects).forEach((c, i) => push(c, `adverseEffects[${i}]`));
  push(rec.pregnancy, 'pregnancy');
  push(rec.lactation, 'lactation');
  push(rec.doseLimits, 'doseLimits');
  push(rec.heavyMetals, 'heavyMetals');
  return refs;
}

/** Every statement-bearing node on the record, paired with a readable key. */
function statementNodes(rec) {
  const out = [];
  asArray(rec.contraindications).forEach((c, i) => out.push([`contraindications[${i}]`, c]));
  asArray(rec.interactions).forEach((c, i) => out.push([`interactions[${i}]`, c]));
  asArray(rec.adverseEffects).forEach((c, i) => out.push([`adverseEffects[${i}]`, c]));
  for (const k of ['pregnancy', 'lactation', 'doseLimits', 'heavyMetals']) {
    if (rec[k]) out.push([k, rec[k]]);
  }
  return out;
}

const statementCount = (rec) =>
  asArray(rec.contraindications).length + asArray(rec.interactions).length
  + asArray(rec.adverseEffects).length
  + (rec.pregnancy ? 1 : 0) + (rec.lactation ? 1 : 0)
  + (rec.doseLimits ? 1 : 0) + (rec.heavyMetals ? 1 : 0);

/**
 * Validate a record. Returns {ok, errors[], warnings[]}.
 * `page` supplies subcategory so heavy-metal enforcement knows whether it applies.
 */
export function validateRecord(rec, page = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);

  if (!text(rec.slug)) err('missing slug');

  // Sources must exist and every one must be on the allowlist.
  const sources = asArray(rec.sources);
  const ids = new Set();
  sources.forEach((s, i) => {
    const id = text(s.id);
    if (!id) err(`sources[${i}]: missing id`);
    else if (ids.has(id)) err(`sources[${i}]: duplicate id "${id}"`);
    else ids.add(id);
    if (!text(s.url)) err(`sources[${i}]: missing url`);
    if (!text(s.accessed)) warnings.push(`sources[${i}]: no accessed date`);
  });
  const srcCheck = checkSources(sources);
  if (!srcCheck.ok) err(`source not on allowlist: ${srcCheck.rejected.join(', ')}`);

  // Dangling references are how a real-looking sentence ends up citing nothing.
  for (const { id, where } of collectRefs(rec)) {
    if (!ids.has(id)) err(`${where}: sourceId "${id}" not in sources`);
  }

  // Enums.
  for (const [i, c] of asArray(rec.contraindications).entries()) {
    if (!text(c.condition)) err(`contraindications[${i}]: missing condition`);
    if (c.severity && !SEVERITIES.includes(c.severity)) err(`contraindications[${i}]: bad severity "${c.severity}"`);
    if (!asArray(c.sourceIds).length) err(`contraindications[${i}]: no source`);
  }
  for (const [i, x] of asArray(rec.interactions).entries()) {
    if (!text(x.drugClass)) err(`interactions[${i}]: missing drugClass`);
    if (x.severity && !SEVERITIES.includes(x.severity)) err(`interactions[${i}]: bad severity "${x.severity}"`);
    if (!asArray(x.sourceIds).length) err(`interactions[${i}]: no source`);
  }
  for (const key of ['pregnancy', 'lactation']) {
    const n = rec[key];
    if (!n) continue;
    if (!STATUSES.includes(n.status)) err(`${key}: bad status "${n.status}"`);
    // insufficient-data is the one status allowed to stand without a citation,
    // because "nobody has established this" has no paper to point at.
    if (n.status !== 'insufficient-data' && !asArray(n.sourceIds).length) err(`${key}: status "${n.status}" needs a source`);
  }

  // Heavy metals: for these kinds an omission is a defect. This is the one field
  // where a blank is treated as an error rather than an unknown, because the whole
  // safety question for a bhasma is what metal is in it.
  const sub = page.subcategory || '';
  if (HEAVY_METAL_REQUIRED.has(sub)) {
    const hm = rec.heavyMetals;
    if (!hm || !text(hm.text)) err(`heavyMetals required for subcategory "${sub}"`);
  }

  // Therapeutic claims.
  const prose = JSON.stringify(rec);
  for (const p of CLAIM_PATTERNS) {
    const m = prose.match(p);
    // A product's own name is fixed and is never a claim; nothing here renames one.
    if (m) err(`claim-shaped phrasing: "${m[0]}"`);
  }

  // Scope is required on every statement, not optional. A reader looking at a
  // contraindication needs to know whether it was established for this preparation or
  // for the class it belongs to, and those carry very different weight. Leaving it
  // unstated lets class-level evidence read as a specific finding, which is the more
  // dangerous direction of the two.
  for (const [key, node] of statementNodes(rec)) {
    if (!node.scope) err(`${key}: missing scope (preparation-specific or class-level)`);
    else if (!SCOPES.includes(node.scope)) err(`${key}: bad scope "${node.scope}"`);
  }

  // insufficientData means "no source characterises THIS preparation". It may coexist
  // with class-level statements, and only with those: a preparation-specific claim
  // sitting next to "nothing is known about this preparation" is a contradiction, and
  // that is the case this check still refuses.
  if (rec.insufficientData) {
    if (!text(rec.insufficientReason)) err('insufficientData is true but no reason given');
    const specific = statementNodes(rec).filter(([, n]) => n.scope !== 'class-level');
    if (specific.length) {
      err('insufficientData is true, so every statement must be scope "class-level"; '
        + `these are not: ${specific.map(([k]) => k).join(', ')}`);
    }
  } else if (statementCount(rec) === 0) {
    err('record is empty and insufficientData is not set: silence is not a valid state');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Strongest source class backing any statement on the record, for display ranking. */
export function strongestClass(rec) {
  let best = null;
  for (const s of asArray(rec.sources)) {
    const r = resolveSource(s.url);
    if (r && (best === null || classRank(r.cls) < classRank(best))) best = r.cls;
  }
  return best;
}
