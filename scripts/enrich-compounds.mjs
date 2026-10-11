#!/usr/bin/env node
/**
 * Resolve the constituent names in the co-occurrence graph against PubChem.
 *
 * Two things come out, and again the second is worth more than the first.
 *
 * The identifiers are useful: a CID, molecular formula, weight, InChIKey and SMILES turn
 * a list of strings into entries that join to the rest of chemistry, and a reader can
 * check any of them in one click.
 *
 * The InChIKey does something the names cannot. The graph currently keys on a normalised
 * name, so one molecule written two ways is two nodes, and the sources they share are
 * invisible to each other. An InChIKey is a canonical identifier for a structure, so
 * names that resolve to the same key are the same substance and their nodes merge. That
 * makes the co-occurrence weights more correct rather than merely better labelled.
 *
 * Names that resolve to nothing are kept and marked unresolved, which is honest and also
 * informative: "Flavonoids" and "Saponins" are classes of compound rather than compounds,
 * and the distinction is real chemistry, not a data-quality failure.
 *
 *   node scripts/enrich-compounds.mjs [--limit=N] [--retry-misses]
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveAll, saveCache, getJsonWithBackoff, RATE } from './lib/enrich.mjs';

const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) ?? '').split('=')[1]) || Infinity;
const RETRY = process.argv.includes('--retry-misses');

const SRC = path.join('src', 'data', 'compounds.json');
if (!fs.existsSync(SRC)) {
  console.error('src/data/compounds.json missing. Run scripts/compounds.mjs first.');
  process.exit(1);
}
const graph = JSON.parse(fs.readFileSync(SRC, 'utf8'));
/**
 * EVERY NAME, INCLUDING THE ONES THE MERGE ABSORBED. This line read `c.name` alone, and that one
 * omission made the whole build oscillate with a period of two.
 *
 * compounds.mjs merges nodes that share an InChIKey, keeps the most-cited spelling and records the
 * rest in `alsoKnownAs`. It takes the name-to-InChIKey mapping from chemistry.json, which this
 * script writes. So resolving only the surviving names meant that the moment Beta-sitosterol was
 * merged into Sitosterol it vanished from the list of names asked about, chemistry.json lost its
 * mapping on the next run, and the pass after that could no longer merge it. The merge was
 * destroying the evidence the merge depended on.
 *
 * Two consecutive builds on byte-identical content therefore alternated between 838 compounds with
 * 466 resolved and 849 with 455, and compoundsResolved is a deploy gate with its baseline pinned at
 * 455. It swung across its own threshold on nothing but how many times the build had run, which
 * also means it could not have detected a real regression smaller than eleven compounds.
 *
 * Asking about alsoKnownAs costs nothing: those names are already in the PubChem cache precisely
 * because a previous run resolved them, so this is a cache read rather than a new request.
 */
const names = [...new Set(graph.compounds.flatMap((c) => [c.name, ...(c.alsoKnownAs ?? [])]))];
console.log(`constituents in the graph: ${graph.compounds.length}, names to resolve: ${names.length}`);

const PROPS = 'MolecularFormula,MolecularWeight,InChIKey,CanonicalSMILES,IUPACName';

async function lookup(name) {
  const url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/'
    + `${encodeURIComponent(name)}/property/${PROPS}/JSON`;
  const r = await getJsonWithBackoff(url, { rateMs: RATE.pubchem });

  if (r.notFound) return { status: 'not-found' };
  if (!r.ok) return { status: 'error', error: r.error ?? `http ${r.status}` };

  const p = r.data?.PropertyTable?.Properties?.[0];
  if (!p || !p.CID) return { status: 'not-found' };

  return {
    status: 'ok',
    cid: p.CID,
    formula: p.MolecularFormula ?? '',
    // PubChem returns weight as a string; keep it as given rather than reformatting.
    weight: p.MolecularWeight ?? '',
    inchikey: p.InChIKey ?? '',
    smiles: p.CanonicalSMILES ?? p.ConnectivitySMILES ?? '',
    iupacName: p.IUPACName ?? '',
  };
}

const { cache } = await resolveAll('pubchem', names, lookup, {
  // Well inside PubChem's five-a-second ceiling. The binding constraint is its rolling
  // window rather than the instantaneous rate, which the backoff handles.
  rateMs: 900, retryMisses: RETRY, label: 'PubChem', limit: LIMIT,
});
saveCache('pubchem', cache);

// ------------------------------------------------------------------ report
const rows = graph.compounds.map((c) => ({ ...c, chem: cache.entries[c.name] ?? null }));
const resolved = rows.filter((r) => r.chem?.status === 'ok');
const missing = rows.filter((r) => r.chem?.status === 'not-found');
const pending = rows.filter((r) => !r.chem);

// Distinct structures, which is the number the graph should really be keyed on.
const byKey = new Map();
for (const r of resolved) {
  if (!r.chem.inchikey) continue;
  if (!byKey.has(r.chem.inchikey)) byKey.set(r.chem.inchikey, []);
  byKey.get(r.chem.inchikey).push(r.name);
}
const dupes = [...byKey.entries()].filter(([, ns]) => ns.length > 1);

console.log(`\nresolved to a CID   ${resolved.length}`);
console.log(`no PubChem match    ${missing.length}   <- mostly compound CLASSES, not molecules`);
if (pending.length) console.log(`not yet attempted   ${pending.length}`);
console.log(`distinct structures ${byKey.size}`);
console.log(`names sharing a structure (mergeable): ${dupes.length}`);
for (const [k, ns] of dupes.slice(0, 10)) console.log(`  ${k}  ${ns.join(' = ')}`);
if (missing.length) console.log(`\nunmatched sample: ${missing.slice(0, 10).map((m) => m.name).join(', ')}`);

const payload = {
  updatedAt: cache.updatedAt,
  source: 'PubChem PUG-REST, https://pubchem.ncbi.nlm.nih.gov/',
  summary: {
    constituents: rows.length,
    resolved: resolved.length,
    unmatched: missing.length,
    distinctStructures: byKey.size,
    mergeableNames: dupes.length,
  },
  compounds: rows.map((r) => ({
    name: r.name, slug: r.slug, count: r.count,
    ...(r.chem?.status === 'ok'
      ? { cid: r.chem.cid, formula: r.chem.formula, weight: r.chem.weight,
          inchikey: r.chem.inchikey, smiles: r.chem.smiles, iupacName: r.chem.iupacName }
      : { unresolved: true }),
  })),
};
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(path.join('src', 'data', 'chemistry.json'), JSON.stringify(payload, null, 1));
fs.writeFileSync(path.join('public', 'chemistry.json'), JSON.stringify({
  name: 'Age Ayurveda Nighantu constituent chemistry',
  description: 'Phytochemical constituents named in this reference, resolved against PubChem '
    + 'to a CID, molecular formula, weight, InChIKey and SMILES. Names that resolve to nothing '
    + 'are retained and marked unresolved: many are classes of compound rather than compounds.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  ...payload,
}, null, 1));
console.log('\nwrote src/data/chemistry.json and public/chemistry.json');
