#!/usr/bin/env node
/**
 * Tests for the product-page extractor.
 *
 * The finding this feeds is mostly about ABSENCE: that a company publishes no ingredient
 * quantity. A claim of absence is only safe if "absent" and "we could not read it" never get
 * confused, and if a pack size is never counted as an ingredient quantity. Those two are what
 * most of these cases are about.
 */
import assert from 'node:assert/strict';
import { htmlToText, extractProduct, quantities, isPackSize, isBasis, isDoseFigure, authorities, productNode } from '../lib/product-extract.mjs';

let n = 0;
const eq = (label, a, b) => { assert.equal(a, b, `${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); n += 1; };
const ok = (label, v) => { assert.ok(v, label); n += 1; };

const filler = '<p>'.concat('This page describes the product at length and exists to give the extractor enough readable text that it is not mistaken for a shell rendered by JavaScript. '.repeat(8), '</p>');

// --- text extraction keeps the row structure a composition depends on ---
eq('script content is dropped', htmlToText('<p>a</p><script>var x="INGREDIENTS"</script><p>b</p>'), 'a\nb');
eq('rows stay on one line', htmlToText('<table><tr><td>Haritaki</td><td>4.8 kg</td></tr><tr><td>Guda</td><td>9.6 kg</td></tr></table>').split('\n').length, 2);
eq('entities decoded', htmlToText('<p>Guda &amp; Dhataki &frac12;</p>'), 'Guda & Dhataki ½');
eq('numeric entities decoded', htmlToText('<p>4&#46;8 kg</p>'), '4.8 kg');
eq('br becomes a line', htmlToText('<p>Haritaki 4.8 kg<br>Guda 9.6 kg</p>').split('\n').length, 2);

// --- the three states, which are the whole point ---
const withTable = `<html><head><title>Abhayarishta 450 ml</title></head><body>${filler}
<h3>Each 10 ml contains</h3>
<table>
<tr><td>Haritaki (Fr. P.)</td><td>4.8 g</td></tr>
<tr><td>Draksha (Dr. Fr.)</td><td>2.4 g</td></tr>
<tr><td>Vidanga (Fr.)</td><td>0.96 g</td></tr>
</table>
<h3>Dosage</h3><p>12 to 24 ml twice a day after food.</p>
<p>Net weight 450 ml</p></body></html>`;
const a = extractProduct(withTable);
eq('composition found', a.composition.state, 'found');
eq('three quantities', a.quantityCount, 3);
// The pack size sits outside the composition block, so it never enters the count at all.
eq('the pack size is not among the quantities', a.quantities.some((q) => /net weight/i.test(q.raw)), false);
// And when a pack line sits INSIDE the block, which some labels do, it is dropped there.
const withPackInside = `<html><body>${filler}
<h3>Composition</h3>
<p>Net weight: 450 ml</p>
<p>Haritaki 4.8 g</p>
<p>Guda 9.6 g</p>
</body></html>`;
const p2 = extractProduct(withPackInside);
eq('a pack line inside the block is dropped', p2.quantityCount, 2);
eq('and counted as dropped', p2.packSizesIgnored, 1);
eq('quantity attaches to its ingredient', a.quantities[0].attachedTo.includes('Haritaki'), true);
eq('unit normalised', a.quantities[0].unit, 'g');
eq('dose found', a.dose.state, 'found');
ok('dose text carries the figure', /12 to 24 ml/.test(a.dose.text));

const noComposition = `<html><head><title>Chyawanprash 1 kg</title></head><body>${filler}
<h2>Benefits</h2><p>A traditional preparation taken through the winter.</p>
<p>Net weight: 1 kg. MRP 450.</p></body></html>`;
const b = extractProduct(noComposition);
eq('composition absent, not unreadable', b.composition.state, 'absent');
eq('no quantities claimed', b.quantityCount, 0);
eq('dose absent', b.dose.state, 'absent');

const shell = '<html><head><title>Product</title></head><body><div id="root">Loading...</div></body></html>';
const c = extractProduct(shell);
eq('a client-rendered shell is unreadable, not absent', c.composition.state, 'unreadable');
eq('and its dose is unreadable too', c.dose.state, 'unreadable');

// A page with a Loading banner ABOVE real content is readable, not a shell.
const lateBanner = `<html><body><p>Ingredients: Haritaki, Guda, Dhataki.</p>${filler}<p>Loading reviews...</p></body></html>`;
eq('a loading banner further down does not make a page a shell', extractProduct(lateBanner).composition.state, 'found');

// --- a pack size must never be read as an ingredient quantity ---
eq('net weight is a pack size', isPackSize(quantities('Net Weight: 450 ml')[0]), true);
eq('pack of two is a pack size', isPackSize(quantities('Pack size 100 g')[0]), true);
eq('an mrp line is a pack size', isPackSize(quantities('MRP Rs 450 for 450 ml')[0]), true);
eq('a bare figure with nothing before it is not an ingredient', isPackSize(quantities('450 ml')[0]), true);
eq('an ingredient row is not a pack size', isPackSize(quantities('Haritaki (Fr. P.)\t4.8 g')[0]), false);

// --- quantities as actually printed, including the non-metric ones ---
eq('a range is kept whole', quantities('Dose 12-24 ml')[0].amount, '12-24');
eq('parts are a real proportion', quantities('Trikatu 1 part')[0].unit, 'part');
eq('a percentage is kept', quantities('Alcohol 8 %')[0].unit, '%');
eq('a traditional weight is kept', quantities('Suvarna bhasma 1 ratti')[0].unit, 'ratti');
eq('a comma decimal normalises', quantities('Guda 9,6 kg')[0].amount, '9.6');
eq('mg is not matched inside a word', quantities('Omgosh 5 mg')[0].unit, 'mg');
eq('a unit glued to a word is not a unit', quantities('Hingvastaka 100gram')[0].unit, 'g');

// --- where the formula is said to come from ---
eq('the formulary is recognised', authorities('Prepared as per the Ayurvedic Formulary of India.')[0].id, 'afi');
eq('the pharmacopoeia is recognised', authorities('Conforms to Ayurvedic Pharmacopoeia of India standards.')[0].id, 'api');
eq('a classical text is recognised', authorities('Reference: Bhaishajya Ratnavali, Arsorogadhikara.')[0].id, 'classical');
eq('a page citing nothing reports nothing', authorities('A traditional winter tonic.').length, 0);
ok('the citation carries its quote', authorities('Made to the Ayurvedic Formulary of India specification.')[0].quote.includes('Formulary'));

// --- JSON-LD, which is where some of these sites put the only ingredient list ---
const ld = `<html><body>${filler}<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Product","name":"Hingvashtak Churna","sku":"HC-100","description":"Ingredients: Shunthi 1 part, Pippali 1 part, Hing 1 part."}]}
</script></body></html>`;
const d = extractProduct(ld);
eq('the product node is found inside @graph', d.productName, 'Hingvashtak Churna');
eq('sku read', d.sku, 'HC-100');
eq('the json-ld description is searched too', d.composition.state, 'found');
eq('and its quantities counted', d.quantityCount, 3);

// A broken JSON-LD block must not take the page down with it.
const broken = `<html><body>${filler}<script type="application/ld+json">{ not json</script><p>Ingredients: Haritaki, Amalaki, Bibhitaki.</p></body></html>`;
eq('a broken json-ld block is skipped', extractProduct(broken).composition.state, 'found');
eq('and no product node is claimed', productNode(broken), null);

// --- a heading is not enough: what follows has to read as a list ---
// This is the error that would quietly destroy the result. "Skip to main content" carries the
// word `content`, sits two lines into a Dabur page, and had three products recorded as
// publishing a composition whose text was "About Us | button". A false claim of PRESENCE is
// worse than a miss, because the finding being built is a claim of absence.
const navTrap = `<html><head><title>Sitopaladi Churna</title></head><body>
<p>Skip to main content</p><p>About Us</p><p>button</p>${filler}
<h2>Benefits</h2><p>Traditionally taken for cough.</p></body></html>`;
const nt = extractProduct(navTrap);
eq('skip-to-main-content is not a composition', nt.composition.state, 'absent');
eq('and nothing was claimed from it', nt.composition.text, null);

// Prose that happens to follow the word is not a list either, and the fact that a heading
// matched is recorded rather than silently dropped.
const prose = `<html><body>${filler}<h3>Ingredients</h3>
<p>This formulation comes from a classical recipe and has been made the same way for decades.</p>
</body></html>`;
const pr = extractProduct(prose);
eq('prose after the heading is not a composition', pr.composition.state, 'absent');
ok('but the heading is recorded for review', pr.composition.labelSeenButNoList);

// Repeated boilerplate has one distinct item however many lines it runs to.
const sprawl = `<html><body>${filler}<p>Contains</p>${'<p>line of prose that is not an ingredient</p>'.repeat(90)}</body></html>`;
eq('repeated boilerplate is not a list', extractProduct(sprawl).composition.state, 'absent');

// --- the repeated-heading layout, where the word precedes EVERY ingredient ---
// Reading only the first block returns one ingredient out of five and makes a page that does
// name its ingredients look almost bare.
const repeated = `<html><body>${filler}
<h4>INGREDIENTS</h4><p>Amla</p><p>Richest source of Vitamin C and a classical rasayana drug.</p>
<h4>INGREDIENTS</h4><p>Bilva</p><p>Valued for its root, fruit and leaves.</p>
<h4>INGREDIENTS</h4><p>Brahmi</p><p>Recognised as an intellect promoter.</p>
<h4>INGREDIENTS</h4><p>Pippali</p><p>Contains piperine.</p>
<h4>INGREDIENTS</h4><p>Yashtimadhu</p><p>Considered strength promoting.</p>
</body></html>`;
const rp = extractProduct(repeated);
eq('the repeated-heading layout is read', rp.composition.state, 'found');
eq('and recorded as that layout', rp.composition.layout, 'repeated-heading');
eq('all five ingredients, not one', rp.composition.text.split('\n').length, 5);
ok('the last one is there', /Yashtimadhu/.test(rp.composition.text));
eq('and no quantity is invented', rp.quantityCount, 0);

// A real table still takes the ordinary path.
eq('an ordinary table is a block, not a repeated heading', a.composition.layout, 'block');

// The block cap still holds on a real list.
const longList = `<html><body>${filler}<h3>Composition</h3>${Array.from({ length: 80 }, (_, i) => `<p>Dravya number ${i} 1.5 g</p>`).join('')}</body></html>`;
eq('the block is capped', extractProduct(longList).composition.text.split('\n').length <= 40, true);

// --- a framework payload: data shipped in the HTML but not rendered as HTML ---
// Shree Dhootapapeshwar's pages are 72 KB of HTML rendering 73 characters of text, and the
// composition, with a milligram figure for every ingredient, is in the React flight stream the
// response already carried. Reading it needs no second request and no JavaScript.
const flight = `<html><head><title>Aravindasava</title></head><body><div id="__next">Loading...</div>
<script>self.__next_f.push([1,"{\\"product\\":{\\"name\\":\\"Aravindasava\\",\\"ingredients\\":\\"Each 10 ml contains extract derived from Kamala (Nelumbium speciosum) Fl., Ushira (Vetiveria zizanioides) Rt. each 16.293 mg, Draksha (Vitis vinifera) Fr. 325.866 mg, Dhataki (Woodfordia fruticosa) Fl. 260.692 mg and Sharkara 1629.328 mg.\\",\\"dosage\\":\\"3 - 12 ml twice a day or as directed by the Physician.\\",\\"indication\\":\\"Agnimandya as in Bhaishajya Ratnavali.\\"}}"])</script>
</body></html>`;
const fl = extractProduct(flight);
eq('a framework payload is read, not called unreadable', fl.composition.state, 'found');
eq('and attributed to the field the site named', fl.composition.via, 'json field "ingredients"');
eq('the basis is separated from the ingredients', fl.basis, '10 ml');
eq('four ingredient quantities, not five', fl.quantityCount, 4);
eq('the dose comes from its own field', fl.dose.state, 'found');
ok('and carries the figure', /3 - 12 ml/.test(fl.dose.text));
eq('the classical source in the payload is seen', fl.authorities[0].id, 'classical');

// Attribution is measured from the previous figure on the line, not from the start of it.
const oneLine = quantities('Kamala Fl., Ushira Rt. each 16.293 mg, Draksha Fr. 325.866 mg, Dhataki Fl. 260.692 mg');
eq('three figures on one line', oneLine.length, 3);
eq('the second is attributed to Draksha alone', oneLine[1].attachedTo, 'Draksha Fr.');
eq('the third to Dhataki alone', oneLine[2].attachedTo, 'Dhataki Fl.');

// The basis figure is excluded, and a bare "each" is never an ingredient.
eq('a basis figure is not an ingredient', isPackSize(quantities('Each 10 ml')[0]), true);
eq('and is identified as the basis', isBasis(quantities('Each 10 ml')[0]), true);
// "prepared from" introduces the list the same way "contains" does, so a figure hanging off it
// is still the basis and not a component.
eq('prepared from introduces, it does not compose', isBasis(quantities('Each 100 ml prepared from 50 ml')[1]), true);
// A real ingredient after the basis is kept.
const afterBasis = extractProduct(`<html><body>${filler}<h3>Each 100 ml prepared from</h3>
<p>Water 1600 ml</p><p>Godugdha 200 ml</p><p>Haritaki 44.44 g</p></body></html>`);
eq('ingredients after the basis are counted', afterBasis.quantityCount, 3);

// An empty or null field is not a composition.
const emptyField = `<html><body>${filler}<script>self.__next_f.push([1,"{\\"ingredients\\":\\"\\"}"])</script></body></html>`;
eq('an empty ingredients field is not a composition', extractProduct(emptyField).composition.state, 'absent');

// --- a prose heading is not a composition heading ---
// "MODE OF ACTION: (X contains the following ingredients)" is seventy characters, so a length
// test passed it, and the paragraph of pharmacology under it split on commas into short
// fragments and validated as a list. Function-word counting separates a heading from a sentence.
const modeOfAction = `<html><body>${filler}
<h3>MODE OF ACTION: (Avipattikar Churna contains the following ingredients)</h3>
<p>Amla acts as antioxidant, immunomodulatory, rejuvenating and anti-ageing property.</p>
<p>Nisoth is useful in the management of constipation.</p>
<p>Mustak supports healthy digestive system.</p></body></html>`;
eq('a prose heading is rejected', extractProduct(modeOfAction).composition.state, 'absent');

// A real heading with one function word still works.
const realHeading = `<html><body>${filler}<h3>Each 100 ml prepared from</h3>
<p>Water 1600 ml</p><p>Godugdha 200 ml</p><p>Haritaki 44.44 g</p></body></html>`;
eq('a real heading with one function word is kept', extractProduct(realHeading).composition.state, 'found');

// --- a dose printed inside the composition block is not an ingredient quantity ---
const doseInBlock = `<html><body>${filler}<h3>Ingredients</h3>
<p>Hing, Sontha, Mirch, Pipal, Ajowan, Saindhava namak.</p>
<p>Dosage: 3 g twice a day</p></body></html>`;
const dib = extractProduct(doseInBlock);
eq('the ingredients are read', dib.composition.state, 'found');
eq('and the dose figure is not counted as a quantity', dib.quantityCount, 0);
eq('a dose figure is identified as one', isDoseFigure(quantities('Dosage: 3 g')[0]), true);
eq('an ingredient figure is not', isDoseFigure(quantities('Haritaki 4.8 g')[0]), false);

console.log(`PASS: ${n} product-extraction cases`);
