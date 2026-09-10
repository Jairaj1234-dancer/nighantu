import fs from 'node:fs';
import path from 'node:path';
import { normaliseBinomial } from '../lib.mjs';

/**
 * Botanical binomials recovered for pages whose vault source never stated one.
 *
 * 309 herb pages carried no binomial, which meant they could not be matched to any
 * published literature at all. Each was identified and then handed to an independent
 * verifier instructed to refute the identification against authoritative botanical
 * sources, rejecting for contested identity, wrong species, not-a-plant or
 * unverifiable.
 *
 * The bar is deliberately harsh because a wrong binomial is worse than a blank field:
 * it renders as fact in the key-facts table and the JSON-LD, and it pulls in literature
 * about a different plant. Many classical drug names map to more than one species, and
 * those are left empty on purpose rather than resolved by picking a side.
 *
 * Every value is re-checked through normaliseBinomial here, so a malformed entry can
 * never reach a page even if the file is edited by hand later.
 */

const FILE = path.join('data', 'binomials.json');
let cache = null;

export function loadBinomials() {
  if (cache) return cache;
  cache = new Map();
  if (!fs.existsSync(FILE)) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const [slug, entry] of Object.entries(data.binomials ?? {})) {
      const clean = normaliseBinomial(entry.binomial ?? '');
      if (clean) cache.set(slug, clean);
    }
  } catch (e) {
    console.error(`binomials file unreadable (${e.message}); continuing without it`);
  }
  return cache;
}

export const binomialFor = (slug) => loadBinomials().get(slug) ?? '';
