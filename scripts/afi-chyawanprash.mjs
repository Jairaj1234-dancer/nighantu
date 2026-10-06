#!/usr/bin/env node
/**
 * Reconstruct the Cyavanaprasa ingredient table from the Ayurvedic Formulary of India.
 *
 * Why this one entry gets its own script. Every other AFI table the site publishes came
 * through the general extract-and-verify pipeline, but Cyavanaprasa's page has shipped with
 * no ingredient count at all, on purpose: scripts/audit.mjs blocks one because the available
 * sources said 45, 50 and 18 and nothing settled it. The Formulary settles it, and the reason
 * the general pipeline could not is visible in the OCR. This entry's table came out of the
 * scan in four pieces:
 *
 *   rows 1-32   names only, in one column block
 *   rows 1-5    part and quantity, in a separate block above the page break
 *   rows 6-32   part and quantity, in another block below it
 *   rows 33-48  name, part and quantity together on one line each, undamaged
 *
 * So rows 1-32 have to be rejoined across blocks, and the only link is order. That is the
 * same risk as the Pharmacopoeia column-split problem: an off-by-one puts sesame's part on
 * cardamom. What makes it safe here is that the parts are botanically checkable against the
 * names, and twelve of them pin the alignment independently. Pippali is a fruit, Draksa a
 * dried fruit, Ela a seed, Candana and Agaru heartwood, Sati and Musta rhizomes, Abhaya a
 * pericarp, Amrta a stem, Rddhi and Jivaka tuberous roots. If the join were off by one,
 * those would not line up, and they do.
 *
 * Those checks are ASSERTIONS, not comments. The script refuses to write anything if any of
 * them fails, so a re-OCR of the source that shifts a block cannot quietly republish a wrong
 * table. A page with no count is the state this one has been in for weeks and is survivable;
 * a page with a confidently wrong ingredient list is not.
 *
 * Nothing here is published directly. It writes a candidate for independent verification.
 *
 *   node scripts/afi-chyawanprash.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join('sources-private', 'afi-b32232184.txt');
const OUT = path.join('data', 'chyawanprash-candidate.json');
const COMPOSITION = path.join('src', 'data', 'composition.json');
const PUBLISH = process.argv.includes('--publish');

if (!fs.existsSync(SRC)) {
  console.error(`Missing ${SRC}. Gitignored source text; it has to be present locally.`);
  process.exit(1);
}
const lines = fs.readFileSync(SRC, 'utf8').split('\n').map((s) => s.replace(/\s+$/, ''));

const fail = (msg) => { console.error(`REFUSED: ${msg}`); process.exit(1); };

// ---- locate the entry -----------------------------------------------------------------

const ENTRY = /^(\d{1,2})\s*:\s*(\d{1,3})\s+([A-Z][A-Z0-9 ()'./-]{2,60})/;
const start = lines.findIndex((l) => /^3\s*:\s*11\s+CYAVANAPRASA/.test(l.trim()));
if (start === -1) fail('entry "3 : 11 CYAVANAPRASA" not found');
let end = lines.length;
for (let i = start + 1; i < lines.length; i += 1) {
  if (ENTRY.test(lines[i].trim())) { end = i; break; }
}
console.log(`entry at line ${start + 1}, next entry at ${end + 1}`);

let span = lines.slice(start, end).map((t, i) => ({ text: t.trim(), line: start + i }));

/**
 * Stop the table at the preparation note.
 *
 * The gap to the next entry heading is not the gap to the end of this table. Everything
 * after "Special method of preparation :" is prose and, further down, part of a neighbouring
 * entry's table that OCR pulled in before its own heading: line 7444 reads "33. Marica
 * (Fr.) 12 g.", which is not Cyavanaprasa's row 33. The duplicate check caught it, which is
 * the only reason it is not in the table.
 */
const tableEnd = span.findIndex((s2) => /^(Special method of preparation|Dosage|Anupana|Important therapeutic)/i.test(s2.text));
if (tableEnd === -1) fail('"Special method of preparation" not found, so the table has no reliable end');
console.log(`table ends at line    ${span[tableEnd].line + 1} ("${span[tableEnd].text}")`);
span = span.slice(0, tableEnd);

// ---- the undamaged rows, 33 onward ----------------------------------------------------

/** "33. Vidari (Rt. Tr.) 48 g." and "38. Water for decoction 12.288 1." */
const CLEAN = /^(\d{1,2})\.\s*(.+?)\s*(?:\(([^)]*)\)\s*)?([\d.,]+\s*(?:g|kg|ml|l|1|£|in number)[.;]?|\d+\s*in number)\s*$/i;

const cleanRows = [];
for (const { text, line } of span) {
  const m = text.match(CLEAN);
  if (!m) continue;
  const n = Number(m[1]);
  if (n < 33 || n > 60) continue;
  cleanRows.push({ n, name: m[2].trim(), part: (m[3] ?? '').trim(), quantity: m[4].trim(), line });
}
cleanRows.sort((a, b) => a.n - b.n || a.line - b.line);
if (!cleanRows.length) fail('no undamaged rows found from 33 onward');

/**
 * Keep one row per number, the earliest in the scan.
 *
 * Row 38's quantity is continued on its own line ("reduced to 5.072:") and a few rows are
 * reprinted in the running text that follows the table, so a straight collect gave 28 rows
 * for the 16 numbers 33 to 48. A duplicate that disagreed with its twin would be a real
 * problem, so they are compared rather than just dropped.
 */
const seen = new Map();
for (const r of cleanRows) {
  const prior = seen.get(r.n);
  if (!prior) { seen.set(r.n, r); continue; }
  if (prior.name !== r.name || prior.quantity !== r.quantity) {
    fail(`row ${r.n} appears twice with different content: `
      + `"${prior.name} ${prior.part} ${prior.quantity}" (line ${prior.line}) vs `
      + `"${r.name} ${r.part} ${r.quantity}" (line ${r.line})`);
  }
}
cleanRows.length = 0;
cleanRows.push(...[...seen.values()].sort((a, b) => a.n - b.n));

/**
 * The decoction row's reduction clause, which is printed on its own line.
 *
 * Row 38 is "Water for decoction 12.288 l." and the NEXT line says what it is reduced to.
 * The first version of this script dropped that line, which understated what the book
 * specifies: the volume is a starting quantity, not the amount used.
 *
 * The figure itself is not trustworthy and is marked as such. The scan reads "reduced to
 * 5.072" but the preparation note says reduced to one fourth, and 12.288 / 4 is 3.072, so the
 * leading digit is a misread of either 3 or 5 and this scan cannot settle which. Printing a
 * volume that may be wrong by two litres would be worse than printing the clause and saying
 * the digit is unreadable.
 */
for (const r of cleanRows) {
  if (!/water/i.test(r.name)) continue;
  const after = span.find((s2) => s2.line > r.line && /^reduced to/i.test(s2.text));
  if (!after) continue;
  /**
   * The scan reads "reduced to 5.072" and the book prints 3.072.
   *
   * Calling this unverifiable was wrong. The entry's own method text says the decoction is
   * reduced to one fourth, one drona is 12.288 l by this book's own conversion, and a quarter
   * of that is 3.072. The book prints 3.072 l for this reduction in nine other entries, and
   * 5.072 is not a quarter of anything in the formula. The 5 is a misread 3.
   */
  r.reduction = after.text
    .replace(/\b5\.072\b/, '3.072')
    .replace(/[:;]\s*$/, ' l.').replace(/\s+/g, ' ').trim();
  r.reductionNote = 'The scan reads "5.072". The book prints 3.072 l for this reduction in '
    + 'nine other entries, the method text specifies a reduction to one fourth, and one '
    + 'fourth of 12.288 l is 3.072 l, so the 5 is a misread 3.';
  console.log(`row ${r.n} carries a reduction clause: "${r.reduction}" (digit unverified)`);
}

const highest = cleanRows[cleanRows.length - 1].n;
const cleanNums = cleanRows.map((r) => r.n);
for (let n = 33; n <= highest; n += 1) {
  if (!cleanNums.includes(n)) fail(`row ${n} missing from the undamaged block (33..${highest})`);
}
console.log(`undamaged rows        33..${highest} (${cleanRows.length} rows, no gaps)`);

// ---- the names for rows 1-32 ----------------------------------------------------------

/**
 * A name line. OCR left stray row numbers and leading punctuation on some of them
 * (". Masaparni", "3. Brhati", "_ Srigi (karkatasrngi)"), and one name carries a Devanagari
 * gloss, so the number and the leading debris are stripped and the rest is the name.
 */
const firstPartQty = span.findIndex((s) => /^\(Rt\/St\.\s*Bk\.\)/.test(s.text));
if (firstPartQty === -1) fail('the (Rt/St.Bk.) block for rows 1-5 was not found');

/**
 * Digits are allowed INSIDE a name because OCR reads a terminal "i" as "1":
 * "Kasmari (gambhar1)" and "Abhaya (haritak1)" are rows 4 and 21, and a name pattern that
 * excluded digits silently dropped both, leaving 30 names for 32 rows.
 *
 * The run of at least three consecutive letters is what separates a name from the stray
 * row numbers OCR scattered through the block ("Zo.", "Zit", "Dis"), which otherwise match
 * as plausible names because they begin with a capital.
 */
const NAME = /^[._\-\s]*\d{0,2}[.;:]?\s*([A-Z][A-Za-z0-9ऀ-ॿ()'\s.-]{2,45})$/;
/**
 * Four letters, not three.
 *
 * The stray row numbers in this block did not all come out as digits: "21." was read as
 * "Zit" and "27." as "Dis", both of which begin with a capital and carry three letters, so
 * they survive every structural filter and arrive looking like drug names.
 *
 * Four is safe for this table specifically: its shortest genuine names are Bala, Meda and
 * Sati. It is a threshold tuned to one entry, which is acceptable only because the real
 * guard is downstream, where the count has to come out at exactly 32 and twelve botanical
 * anchors have to line up. Either of those catches a name wrongly kept or dropped.
 */
const LOOKS_LIKE_A_WORD = /[A-Za-z]{4,}|[ऀ-ॿ]{2,}/;
const names = [];
let pendingContinuation = -1;
for (let i = 0; i < firstPartQty; i += 1) {
  const t = span[i].text;
  if (!t) continue;
  // "punarnava)" continues "Punarnava (rakta" from the line above.
  if (/^[a-zऀ-ॿ][A-Za-zऀ-ॿ\s]*\)$/.test(t) && pendingContinuation >= 0) {
    names[pendingContinuation].name = `${names[pendingContinuation].name} ${t}`.replace(/\s+/g, ' ');
    pendingContinuation = -1;
    continue;
  }
  if (/^[\d.,;:_~+\s()£]+$/.test(t)) continue;         // stray numbers and OCR debris
  const m = t.match(NAME);
  if (!m) continue;
  const name = m[1].replace(/\s+/g, ' ').trim();
  if (name.length < 3) continue;
  if (!LOOKS_LIKE_A_WORD.test(name)) continue;
  names.push({ name, line: span[i].line });
  if (/\($/.test(t) || /\([^)]*$/.test(t)) pendingContinuation = names.length - 1;
}

if (names.length !== 32) {
  fail(`expected 32 names for rows 1-32, parsed ${names.length}: ${names.map((n) => n.name).join(' | ')}`);
}
console.log(`names for rows 1-32   ${names.length}`);

// ---- the part and quantity blocks for rows 1-32 ---------------------------------------

const PQ = /^\(?(.{1,22}?)\)?\s*([\d.,]+)\s*(g|kg|ml|£)\.?;?\s*$/;

/** The five (Rt/St.Bk.) lines: the brhat pancamula, rows 1-5. */
const blockA = [];
for (let i = firstPartQty; i < span.length && blockA.length < 5; i += 1) {
  const t = span[i].text;
  if (!t) continue;
  if (!/^\(Rt\/St\.\s*Bk\.\)/.test(t)) break;
  const m = t.match(PQ);
  if (!m) fail(`row ${blockA.length + 1} part/quantity line did not parse: ${JSON.stringify(t)}`);
  blockA.push({ part: 'Rt./St.Bk.', quantity: `${m[2]} ${m[3] === '£' ? 'g' : m[3]}`, line: span[i].line });
}
if (blockA.length !== 5) fail(`expected 5 (Rt/St.Bk.) lines for rows 1-5, got ${blockA.length}`);

/**
 * The part/quantity run for rows 6-32, which sits AFTER the undamaged rows in the scan.
 * `(?1.)`, `(P1.)`, `(PL)` and `((1.)` are all OCR of `(Pl.)`, whole plant.
 */
const lastClean = cleanRows[cleanRows.length - 1].line;
const blockB = [];
for (const { text, line } of span) {
  if (line <= lastClean) continue;
  if (!text) continue;
  if (/^Special method|^Dosage|^Anupana|^Important therapeutic/i.test(text)) break;
  const m = text.match(PQ);
  if (!m) continue;
  let part = m[1].replace(/^[(]+|[)]+$/g, '').trim();
  /**
   * `(?1.)`, `(P1.)`, `(PL)` and `((1.)` are OCR of `(Pl.)`, whole plant.
   *
   * `(P.)` is NOT. It is the Formulary's abbreviation for Pericarp, and folding it into Pl.
   * as an OCR variant rewrote haritaki's part from pericarp to whole plant. The botanical
   * anchor on row 21 caught it, which is the clearest demonstration of why these checks are
   * assertions: the table was otherwise complete and correct, and this single wrong
   * abbreviation would have published silently.
   */
  /**
   * `(?1.)`, `(P1.)`, `(PL)` and `(?.)` are OCR of `(Pl.)`, whole plant.
   *
   * `((1.)` is NOT, and treating it as one FABRICATED a part on a reference page. That
   * string occurs six times in the whole book and never on a whole-plant drug: every
   * instance is karkatasrngi or laksa. It is the book's `(Gl.)`, a gall, which is what
   * karkatasrngi is. The scan degrades `(Pl.)` to `(?1.)`, `(P1.)`, `(PL)` or `(?.)` and
   * never to `((1.)`.
   *
   * `(P.)` is Pericarp and is also not Pl. Two rows in this one table were given a part the
   * book does not print because this pattern was drawn too wide, which is why each variant
   * now has to be justified rather than assumed.
   */
  const captured = m[1];
  const ocrGl = /^\(?[1l]\.?$/.test(captured);
  const ocrPl = !ocrGl && /^[?][1l]\.?$|^P[1l]\.?$|^PL\.?$|^[?]\.$/.test(captured);
  if (ocrGl) part = 'Gl.';
  else if (ocrPl) part = 'Pl.';
  blockB.push({
    part,
    quantity: `${m[2]} ${m[3] === '£' ? 'g' : m[3]}`,
    line,
    ocrPart: (ocrPl || ocrGl) ? m[1] : null,
  });
}
if (blockB.length !== 27) {
  fail(`expected 27 part/quantity lines for rows 6-32, got ${blockB.length}`);
}
console.log(`part/quantity blocks  5 + 27 = ${blockA.length + blockB.length}`);

// ---- clean the OCR out of the names --------------------------------------------------

/**
 * Normalise what the scan did to the names, one documented rule at a time.
 *
 * These are typographic repairs, not editorial ones: nothing here changes which drug a row
 * names or how much of it goes in. Each rule exists because the artefact it fixes is
 * unambiguous in context, and anything ambiguous is left alone rather than guessed at.
 */
/**
 * OCR repairs confirmed against the entry's own Devanagari verse or the book's other entries.
 *
 * Each of these was found by the verification pass, which refused the table until they were
 * fixed, and each is settled by evidence rather than plausibility:
 *
 *   Svadanistra -> Svadamstra   the verse at line 7079 reads श्वदष्ट्रा; the anusvara is the m
 *   Srigi       -> Srngi        the verse at 7083 reads शृंगी, and the n survives inside this
 *                               row's own gloss, karkatasrngi
 *   Vrsamiula   -> Vrsamula     the verse at 7089 reads वृषमूलानि
 *   vanisa      -> vamsa        same m-to-ni slip; the book prints vamsa in four other entries
 *   stksmaila   -> suksmaila    row 30 of THIS table prints suksmaila for the same drug, so
 *                               leaving row 46 as scanned made the table contradict itself
 *
 * The unreadable gloss on row 22 was the worst of the set, because the first version of this
 * script "repaired" it by deleting it. Line 7209 reads "Amrta (परत्र)", a parenthetical whose
 * transliteration the scan destroyed, and the book prints that gloss as guduci in four other
 * entries. Dropping it removed printed text and left row 22 the only gloss-bearing row
 * without its gloss. Restoring the word the book actually prints is the repair; deleting the
 * evidence that a word was there is not.
 */
const OCR_NAME_FIXES = [
  [/Svadanistra/g, 'Svadamstra', 'verse at line 7079 reads श्वदष्ट्रा'],
  [/\bSrigi\b/g, 'Srngi', 'verse at line 7080 reads शृंगी'],
  [/Vrsamiula/g, 'Vrsamula', 'verse at line 7087 reads वृषमूलानि'],
  [/\(vanisa\)/g, '(vamsa)', 'the book prints vamsa elsewhere'],
  [/\(stksmaila\)/g, '(suksmaila)', 'row 30 of this table prints suksmaila'],
  [/\(परत्र\)/g, '(guduci)', 'the book prints this gloss as guduci elsewhere'],
];

function cleanName(raw) {
  let t = String(raw);
  const notes = [];
  let recoveredPart = null;
  for (const [re, to, why] of OCR_NAME_FIXES) {
    if (re.test(t)) { t = t.replace(re, to); notes.push(`read as "${to}" (${why})`); }
  }
  // A terminal "i" inside a gloss read as "1": "(gambhar1)", "(haritak1)".
  if (/[a-z]1\)/.test(t)) { t = t.replace(/([a-z])1\)/g, '$1i)'); notes.push('1 read as i'); }
  // A gloss still unreadable after the confirmed repairs above. MARKED, not deleted: the
  // book printed a word there and a reader is entitled to know one is missing.
  if (/\([^)]*[ऀ-ॿ][^)]*\)/.test(t)) {
    t = t.replace(/\s*\([^)]*[ऀ-ॿ][^)]*\)/g, ' (gloss illegible in the scan)');
    notes.push('a gloss is printed here but is not legible');
  }
  /**
   * A trailing fragment is a PART, not debris.
   *
   * Row 43 reads "Tugaksiri (vanisa) iS) 192 g." and the first version of this script threw
   * "iS)" away as a stray. It is not stray: it is the row's part abbreviation, damaged. The
   * book gives vamsa concretion as (S.C.) in its other entries, so a part is printed here and
   * publishing the row with an empty part asserted an absence the source contradicts. The
   * fragment is now surfaced for the row to carry as illegible rather than discarded.
   */
  const fragment = t.match(/\s([a-zA-Z0-9]{1,3})\)\s*$/);
  if (fragment) {
    t = t.replace(/\s[a-zA-Z0-9]{1,3}\)\s*$/, '');
    // "iS)" is the book's "(S.C.)", silicaceous concretion, which is what tugaksiri is. It
    // is printed cleanly for the same drug at the same 192 g in another entry, so calling it
    // illegible was itself a false claim about the source: the abbreviation is recoverable.
    recoveredPart = /^i?S$|^5[.:;]?0?2?$/i.test(fragment[1]) ? 'S.C.' : null;
    notes.push(recoveredPart
      ? `the part is printed "${fragment[1]})" in the scan and is read as "${recoveredPart}"`
      : `a part abbreviation is printed after the name ("${fragment[1]})") but is not legible`);
  }
  t = t.replace(/[`'\u2018\u2019]+$/, '').replace(/\s+/g, ' ').trim();
  // A missing space before a parenthetical: "Svadanistra(goksura)".
  t = t.replace(/([a-z])\(/g, '$1 (');
  return { name: t, notes, recoveredPart };
}

// ---- join, then check the join --------------------------------------------------------

const rows = names.map((n, i) => {
  const pq = i < 5 ? blockA[i] : blockB[i - 5];
  const c = cleanName(n.name);
  return {
    n: i + 1,
    name: c.name,
    ...(c.notes.length ? { nameOcr: `as printed "${n.name}": ${c.notes.join('; ')}` } : {}),
    part: pq.part,
    quantity: pq.quantity,
    rejoined: true,
    nameLine: n.line,
    partLine: pq.line,
    ...(pq.ocrPart ? { partOcr: pq.ocrPart } : {}),
  };
}).concat(cleanRows.map((r) => {
  const c = cleanName(r.name);
  return {
    n: r.n,
    name: c.name,
    ...(c.notes.length ? { nameOcr: `as printed "${r.name}": ${c.notes.join('; ')}` } : {}),
    // Row 43's part was printed after its name rather than in the part column, so cleanName
    // recovers it. Falling back to it here is what stops that row shipping with an empty
    // part cell, which would assert an absence the book contradicts.
    part: r.part || c.recoveredPart || '',
    /**
     * Units, where the scan produced a character that is not a unit.
     *
     * "£" is "g". And row 38's "12.288 1." is 12.288 LITRES: the litre abbreviation "l."
     * came out as the digit 1, which on a page reads as the number one rather than a unit
     * and is the one OCR artefact here that changes what a reader understands.
     */
    quantity: r.quantity
      .replace(/\s*£\s*\.?$/, ' g.')
      .replace(/([\d.])\s*1\.\s*$/, '$1 l.')
      .replace(/\s+/g, ' ').trim(),
    rejoined: false,
    nameLine: r.line,
    // Carried through explicitly: the mapper builds fresh objects, so the reduction clause
    // set on the parsed row was being dropped again at the last step.
    ...(r.reduction ? { reduction: r.reduction, reductionNote: r.reductionNote } : {}),
  };
}));

/**
 * The join is only trustworthy if the parts match the plants. Each pair below is a part that
 * could not belong to the neighbouring row, so collectively they fix the offset. A failure
 * here means the blocks have moved and the table must not be published.
 */
const ANCHORS = [
  ['Pippali', /Fr/i], ['Draksa', /Dr\.?\s*Fr/i], ['Ela', /Sd/i],
  ['Candana', /Ht\.?\s*Wd/i], ['Agaru', /Ht\.?\s*Wd/i],
  ['Sati', /Rz/i], ['Musta', /Rz/i],
  ['Abhaya', /^P\.?$|Peric/i], ['Amrta', /St\.?$/i],
  ['Rddhi', /Rt\.?\s*Tr|Sub\.?\s*Rt/i], ['Jivaka', /Rt\.?\s*Tr/i], ['Rsabhaka', /Rt\.?\s*Tr/i],
];
const checked = [];
for (const [needle, expect] of ANCHORS) {
  const row = rows.find((r) => r.rejoined && r.name.toLowerCase().startsWith(needle.toLowerCase()));
  if (!row) fail(`anchor "${needle}" not found among the rejoined rows`);
  if (!expect.test(row.part)) {
    fail(`anchor failed: row ${row.n} ${row.name} has part "${row.part}", which does not match ${expect}. `
      + 'The column blocks have shifted; refusing to write a table whose join cannot be confirmed.');
  }
  checked.push(`${row.n} ${row.name} = ${row.part}`);
}
console.log(`\njoin confirmed by ${checked.length} botanical anchors:`);
for (const c of checked) console.log(`  ${c}`);

// ---- what the count actually is -------------------------------------------------------

/**
 * The 45 / 50 / 18 disagreement is a counting question, not a sourcing one, so the record
 * carries each count separately rather than one number that invites the same confusion.
 */
/**
 * The counts, each with its rule stated, because the rule is the whole dispute.
 *
 * The site has refused to print a Chyawanprash ingredient count on the grounds that sources
 * said 45, 50 and 18. The verification pass showed that framing was wrong: 45 is not a rival
 * source at all, it is THIS entry counted under a different rule. Two rules land on it, 46
 * distinct ingredients less the water, and 48 rows less the three non-plant items. So the
 * disagreement was never between sources, it was between people counting rows, ingredients,
 * or herbs and all calling the result "ingredients".
 *
 * Two things the first attempt got wrong, both caught in verification:
 *
 *   Taila is tila, sesame oil, and matsyandika is cane sugar. Both are plant material, so
 *   calling them non-herb alongside water, ghee and honey contradicted its own label. Only
 *   three of the 48 rows are not plant material.
 *
 *   48 rows are not 48 ingredients. Pippali appears at rows 11 and 44 and suksmaila at rows
 *   30 and 46, each added twice at different stages, so the entry has 46 distinct ingredients
 *   in 48 rows. Any figure called a number of ingredients has to be 46, not 48.
 *
 * The decoction range is quoted, never restated. The book prints "Ingredients 1 to 38 are
 * coarsely powdered", but row 38 IS the water and row 37 amalaka is bundled in cloth and
 * suspended whole rather than powdered. The printed sentence is inconsistent with the book's
 * own numbering, so the page may quote it and may not convert it into "38 decoction drugs".
 */
const NOT_PLANT = /^(water|ghrta|madhu)\b/i;
const key = (r) => r.name.toLowerCase().replace(/\s*\(.*/, '').replace(/[^a-z]/g, '');
const distinct = new Set(rows.map(key));
const duplicated = [...new Set(rows.filter((r, i, a) => a.findIndex((x) => key(x) === key(r)) !== i).map(key))];
const notPlant = rows.filter((r) => NOT_PLANT.test(r.name));

const summary = {
  numberedRows: rows.length,
  distinctIngredients: distinct.size,
  rowsListedTwice: duplicated,
  notPlantMaterial: notPlant.map((r) => `${r.n}. ${r.name}`),
  distinctPlantIngredients: distinct.size - notPlant.length,
  decoctionRangeAsPrinted: 'Ingredients 1 to 38 are coarsely powdered',
  decoctionRangeCaveat: 'Quote only. Row 38 is the water itself and row 37 amalaka is bundled '
    + 'in cloth and suspended whole rather than powdered, so the printed range cannot be '
    + 'restated as a count of decoction drugs.',
  reconcilesWith45: 'A count of 45 is this same entry under a different rule: 46 distinct '
    + 'ingredients less the water, or 48 rows less water, ghee and honey. It is not a rival source.',
  doesNotReconcile: 'Neither 50 nor 18 is reachable from this entry under any rule, so both '
    + 'belong to a different recension or a commercial label and must be attributed, not blended in.',
};

const payload = {
  _note: 'CANDIDATE, NOT PUBLISHED. Reconstructed by scripts/afi-chyawanprash.mjs from the '
    + 'AFI scan, where rows 1-32 had their names and their parts in separate OCR column '
    + 'blocks. The join is confirmed by botanical anchors but has not been independently '
    + 'verified. Do not publish until it has been.',
  slug: 'chyawanprash',
  afiPart: 'I',
  entryNumber: '3:11',
  entryHeading: 'CYAVANAPRASA',
  classicalSource: 'Carakasamhita, Cikitsasthana, Adhyaya 1 (1); 62-69',
  sourceUrl: 'https://archive.org/details/b32232184',
  summary,
  joinAnchors: checked,
  verifiedBy: 'workflows: four adversarial lenses over the AFI scan. The join lens passed; '
    + 'the names, count and rows-33-48 lenses each refuted the first reconstruction and their '
    + 'findings are applied here.',
  rows,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`\nnumbered rows         ${summary.numberedRows}`);
console.log(`distinct ingredients  ${summary.distinctIngredients}  (listed twice: ${summary.rowsListedTwice.join(', ') || 'none'})`);
console.log(`not plant material    ${summary.notPlantMaterial.join(', ')}`);
console.log(`distinct plant drugs  ${summary.distinctPlantIngredients}`);
console.log(`\nwrote ${OUT}`);

if (!PUBLISH) {
  console.log('Candidate only. Pass --publish to merge it into src/data/composition.json.');
  process.exit(0);
}

/**
 * Merge into the published composition data.
 *
 * Only reachable because every assertion above passed, and only run deliberately. The rows
 * carry their own provenance: `rejoined` marks the ones whose name and part came from
 * different OCR blocks, `nameOcr` and `partOcr` record every character this script changed
 * and why, and `reduction` carries the decoction clause the first attempt dropped.
 */
const composition = JSON.parse(fs.readFileSync(COMPOSITION, 'utf8'));
composition.records[payload.slug] = {
  afiPart: payload.afiPart,
  entryNumber: payload.entryNumber,
  entryHeading: payload.entryHeading,
  classicalSource: payload.classicalSource,
  sourceUrl: payload.sourceUrl,
  reconstructed: 'This entry\'s table came out of the scan in four separate column blocks and '
    + 'was rejoined. Rows marked rejoined had their name and their part in different blocks. '
    + 'Four adversarial verification passes refused earlier versions of this table; what they '
    + 'found is applied here and recorded per row.',
  counts: payload.summary,
  rows: payload.rows.map((r) => ({
    n: r.n,
    name: r.name,
    gloss: null,
    part: r.part,
    quantity: r.quantity,
    ...(r.reduction ? { reduction: r.reduction, reductionNote: r.reductionNote } : {}),
    ...(r.nameOcr ? { ocrCorrected: r.nameOcr } : {}),
    ...(r.partOcr ? { partOcr: r.partOcr } : {}),
    illegible: false,
    structural: false,
    rejoined: r.rejoined,
  })),
};
fs.writeFileSync(COMPOSITION, `${JSON.stringify(composition, null, 2)}\n`);
console.log(`merged chyawanprash into ${COMPOSITION} (${payload.rows.length} rows)`);
