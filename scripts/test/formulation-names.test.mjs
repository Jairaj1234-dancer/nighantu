#!/usr/bin/env node
/**
 * Tests for the formulation-name matcher.
 *
 * Split into the two failure modes, because they have opposite costs. A MISS loses a product from
 * a comparison and the page simply does not mention it. A FALSE MATCH puts one formulation's
 * composition beside another formulation's label, which is a factual error on a page whose whole
 * claim is that its figures can be checked. The second list is therefore the important one.
 */
import assert from 'node:assert/strict';
import { tokenKey, nameKey, buildMatcher } from '../lib/formulation-names.mjs';

let n = 0;
const eq = (label, a, b) => { assert.equal(a, b, `${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); n += 1; };

// --- the fold itself: spellings of ONE word must collapse together ---
const same = (label, ...words) => {
  const keys = words.map(tokenKey);
  assert.equal(new Set(keys).size, 1, `${label}: ${words.map((w, i) => `${w}=${keys[i]}`).join(' ')}`);
  n += 1;
};
same('aspiration and final m', 'thailam', 'tailam', 'thaila', 'taila');
same('ghrita', 'ghrita', 'grita', 'ghritam', 'ghrtam');
same('churna', 'churna', 'curna', 'choorna', 'churnam');
same('arishta', 'arishta', 'arista', 'arishtam', 'aristam');
same('kashaya', 'kashayam', 'kasayam', 'kashaya', 'kaashaayam');
same('v and w', 'chyawanprash', 'chyavanprash');
same('guggulu', 'guggulu', 'guggul', 'gugulu', 'gugul');
same('vati', 'vati', 'vatika', 'bati');
same('asava', 'asava', 'aasava', 'asavam');
same('rasayana', 'rasayana', 'rasayan', 'rasaayana');

// --- names that must NOT collapse, because they are different formulations ---
const diff = (label, a, b) => { assert.notEqual(tokenKey(a), tokenKey(b), `${label}: both ${tokenKey(a)}`); n += 1; };
diff('maha is distinguishing', 'mahasudarshan', 'sudarshan');
diff('taila is not leha', 'taila', 'leha');
diff('churna is not kwath', 'churna', 'kwath');
diff('a pill is not a decoction', 'vati', 'kwatha');
// Gutika and gulika are pills too, but the formulary prints gutika as its own form with its own
// entries, so the table deliberately leaves them apart rather than merging every pill word.
diff('gutika is left apart from vati', 'gutika', 'vati');
diff('kuzhambu is not taila', 'kuzhambu', 'taila');

// --- whole-name keys ---
eq('brand prefix survives as its own token', nameKey('Baidyanath Abhayarishta'), 'bedyanat-abayarst');
eq('pack size dropped', nameKey('Abhayarishta 450 ml'), nameKey('Abhayarishta'));
eq('dosage form word dropped', nameKey('Arogyavardhini Vati Tablets'), nameKey('Arogyavardhini Vati'));
eq('punctuation and case ignored', nameKey('DHANWANTARAM  THAILAM'), nameKey('dhanwantaram-thailam'));

// --- the matcher, over a realistic slice of the corpus ---
const match = buildMatcher([
  { slug: 'abhayarishta', names: ['Abhayarishta', 'Abhayarishtam'] },
  { slug: 'triphala-churna', names: ['Triphala Churna'] },
  { slug: 'triphala-guggulu', names: ['Triphala Guggulu'] },
  { slug: 'sudarshan-churna', names: ['Sudarshan Churna', 'Sudarsana Curna'] },
  { slug: 'mahasudarshan-churna', names: ['Mahasudarshan Churna'] },
  { slug: 'chyawanprash', names: ['Chyawanprash', 'Chyavanaprasha'] },
  { slug: 'hingvashtak-churna', names: ['Hingvashtak Churna', 'Hingvastaka Churna'] },
  { slug: 'dhanwantaram-thailam', names: ['Dhanwantaram Thailam', 'Dhanvantara Taila'] },
  { slug: 'kaishore-guggul', names: ['Kaishore Guggul', 'Kaishora Guggulu'] },
  { slug: 'anu-taila', names: ['Anu Taila'] },
]);
const slugs = (s) => match(s).map((h) => h.slug).sort();
const one = (label, s, want) => { eq(label, slugs(s).join(','), want); };

// hits, including across spellings and with brand and pack noise around them
one('plain', 'Abhayarishta', 'abhayarishta');
one('brand and size', 'Baidyanath Abhayarishta 450ml', 'abhayarishta');
one('malayalam ending', 'Kottakkal Abhayarishtam', 'abhayarishta');
one('w spelling', 'Dabur Chyawanprash Awaleha', 'chyawanprash');
one('v spelling', 'Chyavanaprasha', 'chyawanprash');
one('hingvastaka variant', 'Hingvastaka Churna 100g', 'hingvashtak-churna');
one('hingvashtak variant', 'Hingvashtak Churna', 'hingvashtak-churna');
one('taila variant', 'Dhanvantara Taila 200 ml', 'dhanwantaram-thailam');
one('thailam variant', 'AVS Dhanwantharam Thailam', 'dhanwantaram-thailam');
one('guggul variant', 'Kaishore Guggulu Tablets', 'kaishore-guggul');
one('two-word target', 'Patanjali Anu Taila Nasya Oil', 'anu-taila');

// THE EXPENSIVE MISTAKES. Each of these once looked like a match to a substring rule.
one('triphala churna is not triphala guggulu', 'Triphala Churna 100g', 'triphala-churna');
one('triphala guggulu is not triphala churna', 'Triphala Guggulu 80 tab', 'triphala-guggulu');
one('bare triphala matches neither', 'Dabur Triphala Powder', '');
one('mahasudarshan is not sudarshan', 'Mahasudarshan Churna', 'mahasudarshan-churna');
one('sudarshan is not mahasudarshan', 'Sudarshan Churna 60g', 'sudarshan-churna');
// Written as two words on the pack, matched as one. And the shorter name must NOT also match
// inside it: without the no-overlap rule this product lands on both pages with two compositions.
one('maha sudarshan as two words', 'Maha Sudarshan Churna 60g', 'mahasudarshan-churna');
// A ghan vati is a concentrated extract, so the churna's quantities do not describe it and the
// matcher is right to refuse rather than to guess the nearest entry.
one('a ghan vati is not the churna', 'Maha Sudarshan Ghan Vati', '');
one('an unrelated product matches nothing', 'Dabur Honitus Cough Syrup', '');
one('a herb is not a formulation', 'Ashwagandha Capsules', '');
one('anu taila is not taila alone', 'Mahanarayan Taila', '');

// An internal vowel one spelling writes and another drops. Only for whole tokens, only at six
// characters or more, so the relaxation cannot start merging short words.
const skel = buildMatcher([
  { slug: 'kanchanara-guggulu', names: ['Kanchanara Guggulu'] },
  { slug: 'hingvashtak-churna', names: ['Hingvashtak Churna'] },
  { slug: 'anu-taila', names: ['Anu Taila'] },
  { slug: 'dashamula', names: ['Dashamula'] },
]);
const skelSlugs = (x) => skel(x).map((h) => h.slug).join(',');
eq('kanchnar is kanchanara', skelSlugs('Baidyanath Kanchnar Guggulu 160 tablets'), 'kanchanara-guggulu');
eq('hingwashtak is hingvashtak', skelSlugs('Hingwashtaka Churna'), 'hingvashtak-churna');
eq('dashmool is dashamula', skelSlugs('Dashmool Kwath'), 'dashamula');
// And the guard holds: short tokens never collapse on their consonants alone.
eq('short tokens do not collapse', skelSlugs('Ani Tila'), '');
eq('a different word with other consonants still misses', skelSlugs('Kanchnath Guggulu'), '');

// A longer target wins when both would match, and the shorter is not also reported.
eq('longest target wins', match('Mahasudarshan Churna').length, 1);

console.log(`PASS: ${n} formulation-name cases`);
