/**
 * Grammar checks for external identifiers.
 *
 * A malformed identifier is worse than a missing one. It looks authoritative, it renders
 * as a link, and it resolves to nothing, so a reader who checks it finds a dead end and
 * a machine that consumes it silently joins to the wrong record or to none. These are
 * cheap and total: an identifier either matches its own published grammar or it does not
 * get published.
 *
 * Deliberately grammar only, not existence. Whether a CID resolves is the enrichment
 * script's job at fetch time, when it has the response in hand. Re-checking every
 * identifier over the network at build time would make the build depend on four
 * third-party services being up, which is exactly the fragility the committed cache
 * exists to avoid.
 */

export const PATTERNS = {
  // GBIF and PubChem both use positive integers, and both have shipped identifiers
  // long enough that a leading zero or a float is a sign of corruption, not a new format.
  gbifKey: /^[1-9]\d*$/,
  cid: /^[1-9]\d*$/,
  ncbiTaxid: /^[1-9]\d*$/,
  wikidata: /^Q[1-9]\d*$/,
  // Fixed-shape hash: 14 characters of skeleton, 10 of stereochemistry and protonation,
  // one version flag. Any deviation means it was truncated or mangled in transit.
  inchikey: /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/,
  // Element symbols with optional counts, plus charge suffixes PubChem does emit.
  formula: /^(?:[A-Z][a-z]?\d*)+(?:[+-]\d*)?$/,
};

export const check = (kind, value) => {
  const p = PATTERNS[kind];
  if (!p) throw new Error(`no pattern for identifier kind "${kind}"`);
  return p.test(String(value));
};

/**
 * Validate a whole dataset of identifier-bearing records.
 * `spec` maps a field name on each record to an identifier kind. A field that is absent
 * or empty is fine; enrichment coverage is partial by design and a gap is not a defect.
 */
export function validateIdentifiers(records, spec, { label = 'records' } = {}) {
  const errors = [];
  for (const rec of records) {
    for (const [field, kind] of Object.entries(spec)) {
      const v = rec[field];
      if (v === undefined || v === null || v === '') continue;
      if (!check(kind, v)) {
        errors.push(`${label}: ${rec.slug ?? rec.query ?? rec.name ?? '?'} has ${field}="${v}", which is not a valid ${kind}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
