---
title: "Why a free translation cannot cite Charaka in the standard form"
slug: "citing-the-classical-texts"
kind: "choosing"
order: 5
description: "The only public-domain English Charaka and Sushruta number their verses differently from the modern editions every paper cites, and the modern numbering is in copyright. Measured across 389 classical citations, with every equivalence this project can state."
answer: "The only public-domain English Charaka is Kaviratna's and the only public-domain English Sushruta is Bhishagratna's. Both number verses their own way: Kaviratna prints Lesson XV verse 2 where modern editions print 15/3. The modern numbering is still in copyright, so a reader working from free sources can read a passage but cannot cite it in the form scholars use, and can easily cite it in a form that looks right and points elsewhere."
ownMeasurement: true
grounding:
  - "The citation counts are of the classical citations in the 28 concept records published on this site, counted from the records themselves. Four further records exist and are withheld from the site, and their citations are not counted here."
  - "Every verse equivalence published here is one a concept record already states in the text a reader sees. Nothing is computed, and no offset is carried from one verse to a neighbouring one. Each was extracted by a judgement pass and then re-checked by an adversarial pass that defaults to rejecting."
  - "The counts of how many citations mention a standard-numbering equivalent are keyword counts and are reported as a ceiling. That a citation mentions the standard numbering can be checked mechanically; that a citation has no standard equivalent anywhere cannot be, and is not claimed."
  - "The full dataset, including the equivalences that were rejected and the reasons, is at /verse-numbering.json and /verse-numbering.csv."
faq:
  - q: "Is there a free English translation of the Charaka Samhita?"
    a: "Yes. Avinash Chandra Kaviratna's translation, published between 1896 and 1913, is in the public domain and freely available, as is Kunja Lal Bhishagratna's Sushruta Samhita of 1907 to 1916. Both are complete and both are usable. What they do not give you is the verse numbering that modern scholarship uses, because they number their own way."
  - q: "Why do Charaka verse numbers differ between editions?"
    a: "Because Kaviratna organised his translation into lessons with their own aphorism numbering rather than following what became the standard verse numbering of the Trikamji-based printed editions. The two do not differ by a constant. In Chikitsasthana 15 the standard number is consistently one higher than Kaviratna's, but in Vimanasthana 2 the observed differences are minus eight and minus seven on adjacent passages, so no rule converts one to the other. A table is the only way."
  - q: "How do I convert a Kaviratna verse reference to the standard numbering?"
    a: "There is no formula, and that is the finding. The difference is chapter-specific and is not always constant inside a chapter. This page publishes every equivalence this project can state from its own sources, as a table and as a downloadable dataset, which is as far as honesty allows. For a passage not in the table, the reference has to be checked against a standard edition, and those are in copyright."
  - q: "Can I cite a classical verse I read in a public-domain translation?"
    a: "You can cite it, but say which translation and numbering you used. A reference written as Cha.Sa. Chikitsa 15/2 when the number came from Kaviratna is a well-formed citation that points at the wrong verse, and a reader checking it in a modern edition will find something else. Naming the translator costs nothing and makes the citation verifiable. The concept pages on this site do it on every citation for exactly this reason."
---

<p class="answer">
The only public-domain English Charaka Samhita is <strong>Kaviratna's (1896 to 1913)</strong> and the
only public-domain English Sushruta is <strong>Bhishagratna's (1907 to 1916)</strong>. Both number
their verses their own way. Kaviratna prints <i>Lesson XV, verse 2</i> where every modern edition
prints <i>15/3</i>. The modern numbering, the one every paper and every textbook uses, lives in
editions still in copyright.
</p>

<p class="lede">
So a reader working from free sources can read the passage and cannot cite it. Worse, they can cite
it in a form that looks entirely correct and points at a different verse, which is harder to catch
than an obviously missing reference.
</p>

## How this project found out, which is the least flattering part

A pass over this site's concept corpus set out to normalise its classical citations into canonical
loci: one agent per concept record, with an adversarial check on every result. The check rejected
120 of 447 normalisations, and 86 of those rejections were the same fault. The normaliser had
dropped the words "Kaviratna's numbering" and emitted a bare standard-form reference. Its own
description of the problem was better than ours:

> silently adopts the translator-specific number while presenting itself in the standard Cha.Sa.
> form, which a reader will check against a vulgate edition and find the wrong verse

The concept records themselves were not at fault. They name the translator and the numbering in the
text a reader sees, on every citation. What would have gone wrong is the tidying: a concordance of
clean-looking loci, built on top of a careful corpus, asserting a precision its sources do not have.

That concordance is not published, and this page exists instead. The planned deliverable was the
thing the check refused.

## The shape of the gap

Across the 389 classical citations in the 28 concept records published here:

<!-- BEGIN generated by scripts/verse-numbering.mjs -->

| | Citations |
|---|---|
| Mention a standard-numbering equivalent | 92 |
| Give only the translator's own numbering | 168 |
| Carry neither marker | 129 |
| **Total** | **389** |

The first row is a ceiling, found by keyword. Of those 92, 78 actually state an equivalence, and **45 state one precisely enough to publish as a verse pair**. 29 state it too loosely to assign a number, in words like "roughly" and "onward". 4 were rejected on the adversarial check and are in the dataset with the reason.

### The offset per chapter, where it could be observed

| Chapter | Pairs | Standard minus translator | |
|---|---|---|---|
| Charaka Samhita Chikitsa 15 | 9 | 1 | constant here |
| Charaka Samhita Sutra 1 | 6 | 1 | constant here |
| Charaka Samhita Sutra 7 | 5 | 2 | constant here |
| Charaka Samhita Nidana 1 | 4 | 6 | constant here |
| Charaka Samhita Sutra 21 | 3 | 1, 4 | not constant |
| Charaka Samhita Vimana 2 | 2 | -8, -7 | not constant |
| Charaka Samhita Sutra 9 | 2 | 2 | constant here |
| Charaka Samhita Vimana 5 | 2 | -7 | constant here |
| Charaka Samhita Sutra 16 | 2 | 3 | constant here |
| Charaka Samhita Nidana 4 | 1 | 1 | constant here |
| Charaka Samhita Sutra 23 | 1 | 1 | constant here |
| Charaka Samhita Vimana 8 | 1 | -13 | constant here |
| Charaka Samhita Vimana 4 | 1 | 1 | constant here |
| Charaka Samhita Sutra 17 | 1 | 2 | constant here |

### Every equivalence this project can state

| Work | Chapter | In the free translation | In the standard editions | As the source states it |
|---|---|---|---|---|
| Charaka Samhita | Nidana 1 | Lesson I, aphorism 3 | Ni. 1/5-1/9 (Trikamji numbering); the five-fold line itself is Ni. 1/6 | Ni. 1/5-1/9 in the Trikamji numbering; the five-fold line itself is Ni. 1/6. Kaviratna prints this whole run as his single aphorism 3. |
| Charaka Samhita | Nidana 1 | Lesson I, aphorism 4 | Ni. 1/10 (Trikamji numbering) | Ni. 1/10 in the Trikamji numbering; Kaviratna's aphorism 4 |
| Charaka Samhita | Nidana 1 | Lesson I, aphorisms 5-6 | Ni. 1/11-1/12 (Trikamji numbering) | Ni. 1/11-1/12 in the Trikamji numbering; Kaviratna's aphorisms 5-6 |
| Charaka Samhita | Nidana 1 | Kaviratna's aphorism 5 | Ni. 1/11 in the Trikamji numbering | Ni. 1/11 in the Trikamji numbering; Kaviratna's aphorism 5, printed after the aphorism |
| Charaka Samhita | Nidana 1 | Kaviratna's aphorism 6 | Ni. 1/12 in the Trikamji numbering | Ni. 1/12 in the Trikamji numbering; Kaviratna's aphorism 6, printed after the aphorism |
| Charaka Samhita | Nidana 1 | Lesson I, aphorisms 7-10 | Ni. 1/12 (Trikamji numbering); sub-parts numbered 12.1 to 12.5 on carakasamhitaonline | Ni. 1/12 in the Trikamji numbering, whose sub-parts carakasamhitaonline numbers 12.1 to 12.5; Kaviratna's aphorisms 7-10 |
| Charaka Samhita | Sutra 1 | verse 23 (Kaviratna) | 1.24 (standard Trikamji numbering) | 1.24 (standard Trikamji numbering); printed as verse 23 by Kaviratna |
| Charaka Samhita | Sutra 1 | verses 43-44 (Kaviratna) | 1.44-1.45 (standard Trikamji numbering) | 1.44-1.45 (standard Trikamji numbering); printed as verses 43-44 by Kaviratna |
| Charaka Samhita | Sutra 1 | Kaviratna prints 43 and 44 | standard (Trikamji) Sutrasthana 1.44-1.45 | Kaviratna prints 43 and 44 after the two sentences; standard (Trikamji) Sutrasthana 1.44-1.45 |
| Charaka Samhita | Sutra 1 | Kaviratna prints 56 after the paragraph | Ca. Su. 1.57 (standard Trikamji numbering) | Ca. Su. 1.57 (standard Trikamji numbering). Kaviratna prints 56 after the paragraph |
| Charaka Samhita | Sutra 1 | Kaviratna prints 58, 59 and 60 after the three paragraphs | Ca. Su. 1.59-61 (standard Trikamji numbering) | Ca. Su. 1.59-61 (standard Trikamji numbering). Kaviratna prints 58, 59 and 60 after the three paragraphs; the OCR renders the last two as '69' and '80' |
| Charaka Samhita | Sutra 1 | verse 133 (Kaviratna) | 1.134 (standard Trikamji numbering) | 1.134 (standard Trikamji numbering); printed as verse 133 by Kaviratna |
| Charaka Samhita | Vimana 2 | Kaviratna's aphorism 16 | Vi.2/9 | Kaviratna's aphorism 16 (cited in the modern vulgate as Vi.2/9) |
| Charaka Samhita | Vimana 2 | Kaviratna's aphorism 20 | Vi.2/12 | Kaviratna's aphorism 20 (cited in the modern vulgate as Vi.2/12) |
| Charaka Samhita | Vimana 4 | Lesson IV, aphorism 2 | Vi. 4/3 (Trikamji numbering) | Vi. 4/3 in the Trikamji numbering; Kaviratna's aphorism 2 |
| Charaka Samhita | Nidana 4 | Kaviratna's aphorism 3 (Nidana Sthana, chapter 4, Prameha Nidana) | Nidana 4.4 (Trikamji numbering) | Kaviratna's aphorism 3, his number printed after the aphorism. The Sanskrit clause is numbered 4 in the Trikamji-based text retrieved (carakasamhitaonline, Prameha Nidana): Kaviratna runs one behind here |
| Charaka Samhita | Vimana 5 | Kaviratna's aphorisms 17-30 | Ca.Vi.5/10-23 | Ca.Vi.5/10-23 (standard). Kaviratna's aphorisms 17-30, printed after each verse; seven ahead of the standard numbering throughout this block |
| Charaka Samhita | Vimana 5 | Kaviratna's aphorism 31 | Ca.Vi.5/24 | Ca.Vi.5/24 (standard). Kaviratna prints 31 after it; in this chapter his numbering runs seven ahead of the standard numbering from standard 5/10 onward |
| Charaka Samhita | Vimana 6 | aphorisms 14-15 | Vi.6/12 | Kaviratna's aphorisms 14-15 (cited in the modern vulgate as Vi.6/12) |
| Charaka Samhita | Sutra 7 | Kaviratna's printed numbers 4-6 | Standard numbering 6-8 | Kaviratna's printed numbers 4-6 (the quote ends at his 6; his 7, the stool treatment, is not quoted). Standard numbering 6-8. |
| Charaka Samhita | Sutra 7 | Kaviratna's printed numbers 20-23 | Standard numbering 22-25 | Kaviratna's printed numbers 20-23 (the scan shows '22' twice; the second is read as 23). Standard numbering 22-25. |
| Charaka Samhita | Sutra 7 | Kaviratna's printed numbers 24-28 | Standard numbering 26-30 | Kaviratna's printed numbers 24-28 (the scan prints '26' and '28-27' irregularly; read as 24, 25, 26-27, 28). Standard numbering 26-30. |
| Charaka Samhita | Sutra 7 | Kaviratna's printed numbers 29-32 | Standard numbering 31-34 | Kaviratna's printed numbers 29-32. Standard numbering 31-34. |
| Charaka Samhita | Sutra 7 | Lesson VII, verse 49 in Kaviratna's numbering | Sutra 7/51 | 49 (Kaviratna); the same verse is numbered Sutra 7/51 in the standard numbering printed by carakasamhitaonline, where the Sanskrit was verified |
| Charaka Samhita | Vimana 8 | Aphorism 123 (Kaviratna's own numbering, printed after the sattva-sara paragraph; OCR'd '12'') | Vimanasthana 8.110 (modern vulgate, Yadavji Trikamji, as printed by carakasamhitaonline) | 8.110 for the sattva-sara paragraph. NUMBERING DECLARED: these are modern-vulgate (Yadavji Trikamji) verse numbers as printed by carakasamhitaonline ... That page gives ... 110 to 'smRutimanto bhaktimantaH ... sattvasArAH\| teShAM svalakShaNaireva guNA vyAkhyAtAH\|\|110\|\|' ... KAVIRATNA'S OWN NUMBERING, which is what the entry previously gave, supports only ONE of its two numbers: 123, printed after the sattva-sara paragraph (OCR'd '12''). 'Aphorism 116' must be removed outright, not corrected to another figure, because no marker of any kind is printed at the eight-saras introduction in the BIUSante_47357 scan ... Kaviratna's numbers in this stretch therefore run roughly thirteen ahead of the vulgate |
| Charaka Samhita | Sutra 9 | verse 1 (Kaviratna) | 9.3 (standard Trikamji numbering) | 9.3 (standard Trikamji numbering); printed as verse 1 by Kaviratna |
| Charaka Samhita | Sutra 9 | verses 2-3 (Kaviratna) | 9.4-9.5 (standard Trikamji numbering) | 9.4-9.5 (standard Trikamji numbering); printed as verses 2-3 by Kaviratna |
| Charaka Samhita | Sutra 12 | Kaviratna splits the aphorism and prints 6 after the normal-function sentence and 7 after the excited-function sentence | Ca. Su. 12.8 (standard Trikamji numbering) | Ca. Su. 12.8 (standard Trikamji numbering). Kaviratna splits the aphorism and prints 6 after the normal-function sentence and 7 after the excited-function sentence |
| Charaka Samhita | Chikitsa 15 | Lesson XV, verse 2 | 15/3 (modern vulgate numbering used by carakasamhitaonline) | Kaviratna's Lesson XV, verse 2 (= 15/3 in the modern vulgate numbering used by carakasamhitaonline; Kaviratna merges the two opening aphorisms, so his numbers run one behind for this chapter) |
| Charaka Samhita | Chikitsa 15 | Lesson XV, verse 3 | 15/4 vulgate | Kaviratna's Lesson XV, verse 3 (= 15/4 vulgate) |
| Charaka Samhita | Chikitsa 15 | Lesson XV, verses 6-7 | vulgate Ci.15/7-8 | Kaviratna's Lesson XV, verses 6-7 (= vulgate Ci.15/7-8) |
| Charaka Samhita | Chikitsa 15 | 12-13 as printed by Kaviratna | standard (Trikamji) 15.13-15.14 | 12-13 as printed by Kaviratna; standard (Trikamji) 15.13-15.14 |
| Charaka Samhita | Chikitsa 15 | 14-15 as printed by Kaviratna | standard (Trikamji) 15.15-15.16 | 14-15 as printed by Kaviratna; standard (Trikamji) 15.15-15.16 |
| Charaka Samhita | Chikitsa 15 | 16-18 as printed by Kaviratna | standard (Trikamji) 15.17-15.19 | 16-18 as printed by Kaviratna; standard (Trikamji) 15.17-15.19 |
| Charaka Samhita | Chikitsa 15 | 20 as printed by Kaviratna | standard (Trikamji) 15.21 | 20 as printed by Kaviratna; standard (Trikamji) 15.21 |
| Charaka Samhita | Chikitsa 15 | 35 as printed by Kaviratna | standard (Trikamji) 15.36 | 35 as printed by Kaviratna; standard (Trikamji) 15.36 |
| Charaka Samhita | Chikitsa 15 | 38 as printed by Kaviratna | standard (Trikamji) 15.39 | 38 as printed by Kaviratna; standard (Trikamji) 15.39 |
| Charaka Samhita | Sutra 16 | Kaviratna prints 10 to 13 | 16.13-16.16 (standard Trikamji numbering) | 16.13-16.16 (standard Trikamji numbering); Kaviratna prints 10 to 13 |
| Charaka Samhita | Sutra 16 | Kaviratna prints 17 | 16.20 (standard Trikamji numbering) | 16.20 (standard Trikamji numbering); Kaviratna prints 17 |
| Charaka Samhita | Sutra 17 | Kaviratna prints 74-75 | standard (Trikamji) Sutrasthana 17.76-17.77 | Kaviratna prints 74-75 after the passage; standard (Trikamji) Sutrasthana 17.76-17.77 |
| Charaka Samhita | Sutra 21 | Kaviratna prints 2 and 3 | standard (Trikamji) Sutrasthana 21.3-21.4 (first part) | Kaviratna prints 2 and 3 after these sentences; standard (Trikamji) Sutrasthana 21.3-21.4 (first part) |
| Charaka Samhita | Sutra 21 | Kaviratna prints 7-8 | standard (Trikamji) Sutrasthana 21.11-21.12 | Kaviratna prints 7-8 after the sentence; standard (Trikamji) Sutrasthana 21.11-21.12 |
| Charaka Samhita | Sutra 21 | Kaviratna prints 12 and 13 | standard (Trikamji) Sutrasthana 21.16-21.17 | Kaviratna prints 12 and 13 after these sentences; standard (Trikamji) Sutrasthana 21.16-21.17 |
| Charaka Samhita | Sutra 22 | Kaviratna prints 7 to 9 | 22.9-22.12a (standard Trikamji numbering) | 22.9-22.12a (standard Trikamji numbering); Kaviratna prints 7 to 9. CORRECTED 2026-10-06 from '22.9-22.11' |
| Charaka Samhita | Sutra 23 | Kaviratna's printed markers 3 and 4 (and his 38 at the end of the lesson) | 23.4-23.5 (standard/Trikamji; his 38 = standard 23.39) | Kaviratna's printed markers 3 and 4 do bracket the quoted sentence, as the field says, but he is one aphorism BEHIND the standard numbering in this lesson rather than zero-offset: his printed 3 closes what the vulgate numbers \|\|4\|\| ... and his printed 4 closes \|\|5\|\| ..., with the same offset at the end of the lesson where his 38 is standard \|\|39\|\|. |

45 pairs from 14 concept records. Each links to the record it came from in the dataset.

<!-- END generated by scripts/verse-numbering.mjs -->

## There is no formula, and that is the finding

If Kaviratna's numbering differed from the standard by a constant, this page would be one sentence
long and you would need no table. It does not, and the table above shows three separate ways it
fails.

**The offset differs by chapter.** In Chikitsasthana 15 the standard number is one higher than
Kaviratna's across all nine equivalences recorded there, which looks like a rule. In Sutrasthana 7
it is two. In Nidanasthana 1 it is six. In Vimanasthana 8 it is minus thirteen. The spread runs from
plus six to minus thirteen, and nothing about a reference tells you which chapter behaves which way.

**The offset is not always constant inside a chapter.** Sutrasthana 21 shows both plus one and plus
four, and Vimanasthana 2 shows minus eight and minus seven on neighbouring passages. One such
chapter would be enough to make conversion by rule unsafe everywhere.

**Sometimes no offset exists at all,** because the relation is not one verse to one verse.
Kaviratna's Nidana 1 aphorism 3 is the whole run Ni. 1/5 to 1/9 in the standard numbering, and the
adversarial check rejected one proposed pair precisely because two Kaviratna aphorisms sat inside a
single standard sutra, so there was no per-verse difference to state. A table can record a
many-to-one relation. Arithmetic cannot.

So the only honest instrument is a table of equivalences somebody has actually checked, which is
what this is, and that is why it is worth publishing even though it is small.

## What this is not

It is not a concordance of either Samhita. It covers the passages this project happens to cite and
nothing else, which is a tiny fraction of two very large books. Anyone who completed it for the
whole of Charaka would be doing a real service, and the data here is published under CC BY 4.0 so it
can be the start of that rather than a thing to redo.

It also makes no claim about which numbering is correct. Kaviratna's is not an error; it is a
different editorial decision, taken before the numbering that became standard had become standard.
The problem is not that one is wrong but that the concordance between them is not freely available,
which is a copyright accident rather than a scholarly disagreement.

## Corrections

If an equivalence here is wrong, tell us and we will correct it. Every row carries the words the
source states it in and a link to the concept page it came from, so each can be checked on its own.
The dataset at [/verse-numbering.json](/verse-numbering.json) and
[/verse-numbering.csv](/verse-numbering.csv) also carries the equivalences that were rejected on the
adversarial check, with the reason for each, and the ones the sources state too loosely to assign a
verse number. Details are on our [corrections page](../../corrections/).
