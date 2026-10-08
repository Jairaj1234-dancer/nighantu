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
import { htmlToText, extractProduct, quantities, isPackSize, authorities, productNode } from '../lib/product-extract.mjs';

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
const broken = `<html><body>${filler}<script type="application/ld+json">{ not json</script><p>Ingredients: Haritaki.</p></body></html>`;
eq('a broken json-ld block is skipped', extractProduct(broken).composition.state, 'found');
eq('and no product node is claimed', productNode(broken), null);

// --- the cap that stops an unstructured page returning its whole body ---
const sprawl = `<html><body><p>Contains</p>${'<p>line of prose that is not an ingredient</p>'.repeat(90)}</body></html>`;
const e = extractProduct(sprawl);
eq('the block is capped', e.composition.text.split('\n').length <= 40, true);

console.log(`PASS: ${n} product-extraction cases`);
