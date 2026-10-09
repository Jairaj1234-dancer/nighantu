export const meta = {
  name: 'label-dose-vs-formulary',
  description: 'For each classical preparation, compare each company stated dose against the Ayurvedic Formulary of India dose, then adversarially verify every verdict',
  phases: [
    { title: 'Compare', detail: 'one agent per preparation, reading the stored label text' },
    { title: 'Verify', detail: 'adversarial re-check of each comparable verdict' },
  ],
}

const COMPARE_SCHEMA = {
  type: 'object',
  properties: {
    formulation: { type: 'string' },
    afiDoseMeans: {
      type: 'string',
      description: 'What the formulary figure measures: "dose taken", "weight of drug used to prepare", or "unclear"',
    },
    classNote: { type: 'string', description: 'One sentence on the preparation class and why it is or is not comparable' },
    labels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          brand: { type: 'string' },
          url: { type: 'string' },
          comparable: { type: 'boolean' },
          notComparableReason: { type: 'string' },
          population: { type: 'string', description: 'adult, child, both, or unstated' },
          adultLow: { type: 'number' },
          adultHigh: { type: 'number' },
          unit: { type: 'string' },
          quote: { type: 'string', description: 'the exact words of the label stating the adult dose, verbatim and short' },
          relation: { type: 'string', description: 'identical, within, contains, overlapping, touching above, touching below, entirely above, entirely below, or not comparable' },
        },
        required: ['brand', 'url', 'comparable', 'relation'],
      },
    },
  },
  required: ['formulation', 'afiDoseMeans', 'labels'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    formulation: { type: 'string' },
    refuted: { type: 'array', items: { type: 'object', properties: {
      brand: { type: 'string' }, problem: { type: 'string' }, correction: { type: 'string' },
    }, required: ['brand', 'problem'] } },
    confirmedBrands: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
  required: ['formulation', 'refuted', 'confirmedBrands'],
}

const RULES = `
HOW TO READ THE FORMULARY FIGURE. The Ayurvedic Formulary of India prints a dose per entry. For a
churna it is the weight of powder taken. For an arishta or asava it is the volume swallowed. For a
KASHAYAM the printed figure is often the WEIGHT OF DRUG used to prepare the decoction, not the
amount swallowed, so a label volume is NOT comparable to it. Same for a ghrita or thailam used
externally. Say so in afiDoseMeans and mark those labels not comparable. A figure like "48 g" for
a kashayam is the clearest case of this.

WHAT COUNTS AS COMPARABLE. Both sides must state an amount of the same thing in the same
dimension. A label saying "1-2 tablets" is NOT comparable to a formulary figure in grams or
milligrams unless the label also states the weight per tablet. A label stating only teaspoons is
not comparable unless it gives its own gram or millilitre equivalent, in which case use the
label's own equivalent and say so.

TRAPS THAT HAVE ALREADY PRODUCED WRONG NUMBERS HERE, so check each one:
  - "1/2-1 g" means half a gram to one gram. Do not read it as 2 to 1.
  - "15 ml to 25 ml" repeats the unit after both bounds. The range is 15 to 25.
  - A page may state an ADULT dose and a CHILD dose. The formulary figure is the adult dose, so
    compare the adult one and record the population you used. Never compare a child dose to it.
  - A page may state different doses for different indications. Record the general one and note it.

THE RELATION VOCABULARY, which has eight values because four was not enough.
  identical        the label range equals the formulary range
  within           the label range sits inside the formulary range
  contains         the label range covers the whole formulary range
  overlapping      they share more than one value
  touching above   they meet at exactly one value and the label is the higher
  touching below   they meet at exactly one value and the label is the lower
  entirely above   no shared value, the label is higher
  entirely below   no shared value, the label is lower
A previous run used "overlapping" for ranges sharing a single value and for ranges where one
contained the other, and 20 of 129 rows had to be reclassified. The relation is also recomputed
arithmetically downstream after converting units, so yours is a cross-check: give the one that
follows from the numbers and say so plainly, and do not round or reinterpret to make a tidier word
fit.

WHAT YOU MUST NOT DO. Do not say or imply that any dose is unsafe, excessive, an overdose, or
wrong. You are comparing two published figures and nothing else. A manufacturer may differ from
the formulary for legitimate reasons, including a different preparation strength or a different
indication. Report only the relation between the two stated figures. Never add a therapeutic or
safety claim of any kind.

Quote the label verbatim and keep the quote short. If you cannot find an adult amount in the text
you were given, mark the label not comparable and say that the text does not state one. Never
infer, estimate or convert an amount that the page does not itself state.
`

/**
 * The script sandbox has no filesystem, but the SUBAGENTS do. So args carries only the fan-out
 * list (38 slugs and the file path) and each agent reads its own entry out of the candidates
 * file. That keeps a 38 KB payload out of the orchestration layer entirely.
 */
const FILE = args.candidates
const data = args.slugs.map((formulation) => ({ formulation }))

phase('Compare')
const results = await pipeline(
  data,
  (prep) => agent(
    `Compare each company's stated dose against the Ayurvedic Formulary of India for one preparation.

Read ${FILE}. It is a JSON array. Find the single object whose "formulation" field is exactly
"${prep.formulation}". That object gives you:
  afiPart, afiEntry, afiHeading  the formulary entry this preparation is printed in
  afiDose                        the dose the formulary prints, verbatim
  afiAnupana                     the anupana the formulary prints, if any
  labels[]                       one entry per company, each with brand, brandName, url and
                                 statedDose, which is the text collected from that company's own
                                 product page

Work only from that object. Do not fetch any URL and do not look anything up: the stated text in
the file is the evidence, and a page may have changed since it was collected.

${RULES}

Return one entry per company in that object's labels array, using the brand id exactly as given.`,
    { label: `compare:${prep.formulation}`, phase: 'Compare', schema: COMPARE_SCHEMA, model: 'fable' },
  ),
  (verdict, prep) => {
    if (!verdict) return null
    const comparable = (verdict.labels ?? []).filter((l) => l.comparable)
    if (!comparable.length) return { verdict, verification: null }
    return agent(
      `Adversarially check dose comparisons that are about to be published about named companies.
Default to refuting. A wrong number about a named manufacturer's dose is the worst failure here.

Read ${FILE} and find the object whose "formulation" is exactly "${prep.formulation}". Its
afiDose is what the formulary prints, and its labels[].statedDose values are the raw text
collected from each company's page. Check the claims below against that file, not against the
claims themselves, and not against anything on the web.

The comparing agent judged the formulary figure to mean: ${JSON.stringify(verdict.afiDoseMeans)}
It gave this reason: ${JSON.stringify(verdict.classNote ?? '')}

THE CLAIMS TO CHECK:
${comparable.map((l) => `  ${l.brand}: adult ${l.adultLow} to ${l.adultHigh} ${l.unit}, population "${l.population}", relation "${l.relation}", quoting ${JSON.stringify(l.quote)}`).join('\n')}

For each claim, check every one of these and refute if any fails:
  1. Do the numbers appear in the raw text as claimed? Re-read the digits character by character.
     "1/2-1 g" is half to one gram. "15 ml to 25 ml" is fifteen to twenty-five.
  2. Is the quote verbatim present in the raw text?
  3. Is the amount the ADULT amount, not a child amount or a different indication's amount?
  4. Is the relation arithmetically right against the formulary figure?
  5. Is the comparison dimensionally legitimate at all, given what the formulary figure measures?
     A kashayam figure that is a drug weight must not be compared to a swallowed volume.
  6. Does any claim carry a safety or therapeutic implication? It must not.

List every brand whose claim survives all six in confirmedBrands, and every failure in refuted.`,
      { label: `verify:${prep.formulation}`, phase: 'Verify', schema: VERIFY_SCHEMA, model: 'fable', effort: 'high' },
    ).then((v) => ({ verdict, verification: v }))
  },
)

const good = results.filter(Boolean)
let comparable = 0
let confirmed = 0
let refuted = 0
const refutations = []
for (const r of good) {
  const c = (r.verdict.labels ?? []).filter((l) => l.comparable)
  comparable += c.length
  if (r.verification) {
    confirmed += (r.verification.confirmedBrands ?? []).length
    refuted += (r.verification.refuted ?? []).length
    for (const x of r.verification.refuted ?? []) {
      refutations.push({ formulation: r.verdict.formulation, ...x })
    }
  }
}
log(`${good.length} preparations judged; ${comparable} comparable claims, ${confirmed} confirmed, ${refuted} refuted`)

return {
  preparations: good.length,
  comparableClaims: comparable,
  confirmed,
  refutedCount: refuted,
  refutations,
  perPreparation: good.map((r) => ({
    formulation: r.verdict.formulation,
    afiDoseMeans: r.verdict.afiDoseMeans,
    classNote: r.verdict.classNote,
    labels: r.verdict.labels,
    confirmedBrands: r.verification?.confirmedBrands ?? [],
    refuted: r.verification?.refuted ?? [],
  })),
}
