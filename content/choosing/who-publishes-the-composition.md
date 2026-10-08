---
title: "Which Ayurvedic manufacturers publish what is in the bottle"
slug: "who-publishes-the-composition"
kind: "choosing"
order: 3
description: "A classical Ayurvedic preparation has an official composition. Whether you can check a product against it depends entirely on which company made it. Measured on 210 product pages across seven companies."
answer: "Classical Ayurvedic preparations have an official composition in the Ayurvedic Formulary of India, which fixes both the ingredients and their quantities. Whether you can check one against it depends on who made it. On 210 product pages read in October 2026, Patanjali Ayurved published an ingredient list on 48 of 53, Shree Dhootapapeshwar on 28 of 32, Baidyanath on 4 of 59 and Maharishi Ayurveda on 1 of 54. This measures disclosure, not quality."
ownMeasurement: true
grounding:
  - "The formulary compositions this page compares against are the transcriptions published on this site, each checked row by row against the Ayurvedic Formulary of India and cited to part and entry number."
  - "The per-company figures are counts of what each company's own product pages carried when this crawler read them on 8 October 2026, recorded in src/data/brand-disclosure.json with the page URL against every count. No figure published by any company is restated here."
  - "Every host's robots.txt was fetched and parsed before any product page, and a host that declined was not fetched. The permission result travels with each record."
faq:
  - q: "Do Ayurvedic companies have to publish the ingredients of a classical preparation?"
    a: "The label is regulated, and that is a different surface from the website. Nothing requires a manufacturer to publish the composition on its product page, and this measurement found that most of the pages read did not. It also found that two companies publish the full composition with a quantity against each ingredient, so it is clearly possible to do."
  - q: "Which Ayurvedic brand lists the most ingredient information online?"
    a: "Of the seven companies whose pages could be read on 8 October 2026, Shree Dhootapapeshwar was the most consistent: every one of its 28 pages that carried an ingredient list also carried a quantity against each ingredient. Patanjali Ayurved published a list on the most pages in absolute terms, 48 of 53. Neither fact says anything about the quality of either company's products."
  - q: "If a company publishes no ingredient list, is the product worse?"
    a: "No, and this page is careful not to imply it. Disclosure and quality are separate. A company that publishes nothing may make an excellent preparation and a company that publishes everything may not. What disclosure changes is whether you, or a pharmacist, or an answer engine, can check a product against the formulary entry it claims."
  - q: "Why can some Ayurvedic products not be found by AI assistants at all?"
    a: "Some manufacturers' robots.txt files decline AI crawlers. One of the twelve companies surveyed here declines every AI crawler tested while allowing Googlebot, which means no answer engine can read its product pages and therefore none can cite it for its own products. That is a choice each company makes, and it has the consequence that a third party becomes the only citable source about their catalogue."
  - q: "What does 'as per AFI' mean if the ingredients are not published?"
    a: "It claims that the recipe and method are the formulary's. Without a published ingredient list there is nothing on the page to check that claim against, so it has to be taken on trust. The formulary entry itself is public, and this site publishes its transcription, so the comparison is available as soon as a manufacturer publishes its own side of it."
---

<p class="disclaimer" style="margin-top:0">
<strong>Disclosure, before anything else.</strong> This site is published by Age Ayurveda, which
sells one of the products counted on this page. That is a conflict of interest and you should read
this page knowing it. What we have done about it: the comparison is organised by preparation rather
than by brand, every count below is of what the company itself published rather than our judgement
of it, we are in the tables and we come last, and we have not scored, ranked or picked a winner.
If you find an error about any company here, including a competitor, tell us and we will correct it.
</p>

A classical Ayurvedic preparation is not a brand's recipe. It is a formula from a classical text,
and in India the Ayurvedic Formulary of India states each one officially: the ingredients, their
plant parts, and the quantity of each. The companion page on
[what the formulary fixes](../reading-a-formulation-label/) sets out exactly what that binds.

So there is a published standard, and a reader holding a bottle has a fair question: does what is
in this bottle match it? That question is answerable only if the manufacturer publishes its side.
This page measures whether they do.

## What was measured, and what it means

Every company's `robots.txt` was fetched and parsed first. Where it declined this crawler, nothing
was fetched and the refusal was recorded. Where it allowed, the catalogue was enumerated from the
sitemap and every product whose name matched one of the 101 formulary entries transcribed on this
site was read once.

Each page then falls into one of three states, and the distinction between the second and the
third is the whole point:

- **Ingredients and quantities.** The page lists what is in the preparation and how much of each.
  This is the only state in which a reader can check the product against the formulary entry.
- **An ingredient list only.** The page names the ingredients and not their amounts. You can see
  whether an ingredient is present or absent; you cannot see whether the proportions are the
  formulary's.
- **Neither.** The page carried substantial readable text and no ingredient list in it.

A page that served almost no text would be a fourth state, because that means the content renders
in the browser rather than in the HTML, which is a fact about a company's stack rather than about
its disclosure. Nothing in this survey ended up there, and the two are kept apart in the data so
that a later run cannot quietly merge them.

<!-- BEGIN generated by scripts/brand-disclosure.mjs -->

### What each company published, by company

<div class="tablewrap wide-table">

| Company | Product pages read | Ingredients and quantities | Ingredient list only | Neither |
| --- | --- | --- | --- | --- |
| Baidyanath | 59 | 0 | 4 | 55 |
| Maharishi Ayurveda | 54 | 1 | 0 | 53 |
| Patanjali Ayurved | 53 | 15 | 33 | 5 |
| Shree Dhootapapeshwar | 32 | 28 | 0 | 4 |
| Dabur | 8 | 0 | 4 | 4 |
| Zandu | 3 | 1 | 2 | 0 |
| Age Ayurveda (ours) | 1 | 0 | 0 | 1 |

</div>

Five further companies were surveyed and
contributed no measured page. Each reason is itself a finding.

- **Arya Vaidya Sala Kottakkal**: its robots.txt declines this crawler, and declines every AI crawler tested except Googlebot, so nothing was fetched.
- **Charak Pharma**: its catalogue was readable and carried no product under any of the formulary names looked for.
- **Himalaya Wellness**: its catalogue was readable and carried no product under any of the formulary names looked for.
- **Unjha Pharmacy**: no readable sitemap was found, so its catalogue could not be enumerated.
- **Vaidyaratnam Oushadhasala**: no readable sitemap was found, so its catalogue could not be enumerated.

### What each company published, by preparation

Only the preparations sold under a formulary name by three or more of the companies read,
which is 28 of them. The second column is the formulary entry itself, as transcribed
and published on this site, which is the thing any of these products can be checked against.

<div class="tablewrap wide-table">

| Preparation | The formulary entry | Publishes ingredients and quantities | Publishes an ingredient list only | Publishes neither |
| --- | --- | --- | --- | --- |
| [Chyawanprash](/formulation/chyawanprash/) | **Part I, 3:11**. CYAVANAPRASA. 48 ingredients, a quantity for every one | Patanjali Ayurved (on 5 of its 7 pages); Shree Dhootapapeshwar | Dabur; Zandu | Age Ayurveda; Baidyanath |
| [Abhayarishta](/formulation/abhayarishta/) | **Part I, 1:1**. ABHAYARISTA. 16 ingredients, a quantity for every one | Shree Dhootapapeshwar | Patanjali Ayurved | Baidyanath; Dabur; Maharishi Ayurveda |
| [Ashokarishta](/formulation/ashokarishta/) | **Part I, 1:5**. ASOKARISTA. 16 ingredients, a quantity for every one | Shree Dhootapapeshwar | Dabur; Patanjali Ayurved | Baidyanath; Maharishi Ayurveda |
| [Dashamularishta](/formulation/dashamularishta/) | **Part I, 1:18**. DASAMULARISTA. 72 ingredients, a quantity for every one | Shree Dhootapapeshwar | Dabur; Patanjali Ayurved | Baidyanath; Maharishi Ayurveda |
| [Sitopaladi Churna](/formulation/sitopaladi-churna/) | **Part I, 7:34**. SITOPALADI CURNA. 5 ingredients, a quantity for every one | Shree Dhootapapeshwar | Patanjali Ayurved | Baidyanath; Dabur; Maharishi Ayurveda |
| [Arjunarishta](/formulation/arjunarishta/) | **Part I, 1:21**. PARTHADYARISTA (Synonym : Arjunarista). 6 ingredients, a quantity for every one | Shree Dhootapapeshwar | Patanjali Ayurved | Baidyanath; Maharishi Ayurveda |
| [Ashwagandharishta](/formulation/ashwagandharishta/) | **Part I, 1:6**. ASVAGANDHADYARISTA. 29 ingredients, a quantity for every one | Shree Dhootapapeshwar | none | Baidyanath; Dabur; Maharishi Ayurveda |
| [Avipattikar Churna](/formulation/avipattikar-churna/) | **Part I, 7:2**. AVIPATTIKARA CURNA. 14 ingredients, a quantity for every one | Shree Dhootapapeshwar | Patanjali Ayurved | Baidyanath; Maharishi Ayurveda |
| [Haridra Khanda](/formulation/haridra-khanda/) | **Part I, 3:31**. HARIDRA KHANDA. 18 ingredients, a quantity for 17 | Shree Dhootapapeshwar | Patanjali Ayurved | Baidyanath; Maharishi Ayurveda |
| [Hingvashtak Churna](/formulation/hingvashtak-churna/) | **Part I, 7:37**. HINGVASTAKA CURNA. 8 ingredients, a quantity for 7 | Shree Dhootapapeshwar | Baidyanath (on 3 of its 4 pages); Patanjali Ayurved | Maharishi Ayurveda |
| [Kaishore Guggul](/formulation/kaishore-guggul/) | **Part I, 5:2**. KAISORA GUGGULU. 17 ingredients, a quantity for every one | Shree Dhootapapeshwar | Patanjali Ayurved | Baidyanath; Maharishi Ayurveda |
| [Kanchanara Guggulu](/formulation/kanchanara-guggulu/) | **Part I, 5:1**. KANCANARA GUGGULU. 12 ingredients, a quantity for every one | Maharishi Ayurveda; Shree Dhootapapeshwar | Patanjali Ayurved | Baidyanath |
| [Kutajarishta](/formulation/kutajarishta/) | **Part I, 1:11**. KUTAJARISTA. 7 ingredients, a quantity for every one | Shree Dhootapapeshwar | none | Baidyanath; Maharishi Ayurveda; Patanjali Ayurved |
| [Mahayograj Guggul](/formulation/mahayograj-guggul/) | **Part I, 5:6**. MAHA YOGARAJA GUGGULU. 31 ingredients, a quantity for 29 | none | Patanjali Ayurved | Baidyanath; Maharishi Ayurveda; Shree Dhootapapeshwar |
| [Triphala Churna](/formulation/triphala-churna/) | **Part I, 7:15**. TRIPHALA CURNA. 3 ingredients, a quantity for every one | Shree Dhootapapeshwar | none | Baidyanath; Dabur; Patanjali Ayurved |
| [Yogaraja Guggulu](/formulation/yogaraja-guggulu/) | **Part I, 5:7**. YOGARAJA GUGGULU. 29 ingredients, a quantity for 27 | none | Patanjali Ayurved | Baidyanath; Maharishi Ayurveda; Shree Dhootapapeshwar |
| [Amritarishta](/formulation/amritarishta/) | **Part I, 1:2**. AMRTARISTA. 24 ingredients, a quantity for every one | Shree Dhootapapeshwar | none | Baidyanath; Maharishi Ayurveda |
| [Anu Taila](/formulation/anu-taila/) | **Part I, 8:1**. ANU TAILA. 30 ingredients, a quantity for 29 | Patanjali Ayurved | none | Maharishi Ayurveda; Shree Dhootapapeshwar |
| [Aravindasava](/formulation/aravindasava/) | **Part I, 1:4**. ARAVINDASAVA. 28 ingredients, a quantity for 27 | Shree Dhootapapeshwar | Patanjali Ayurved | Maharishi Ayurveda |
| [Arogyavardhini Vati](/formulation/arogyavardhini-vati/) | **Part I, 20:4**. AROGYAVARDHINI GUTIKA. 13 ingredients, a quantity for 12 | none | Patanjali Ayurved | Baidyanath; Maharishi Ayurveda |
| [Chandraprabha Vati](/formulation/chandraprabha-vati/) | **Part I, 12:10**. CANDRAPRABHA VATI. 37 ingredients, a quantity for every one | none | Patanjali Ayurved | Baidyanath; Maharishi Ayurveda |
| [Dashamula](/formulation/dashamula/) | **Part I, 4:10**. DASAMULA KVATHA CURNA. 10 ingredients, a quantity for every one | none | Baidyanath; Patanjali Ayurved | Maharishi Ayurveda |
| [Gokshuradi Guggulu](/formulation/gokshuradi-guggulu/) | **Part I, 5:3**. GOKSURADI GUGGULU. 10 ingredients, a quantity for every one | Shree Dhootapapeshwar | Patanjali Ayurved | Maharishi Ayurveda |
| [Pushyanuga Churna](/formulation/pushyanuga-churna/) | **Part I, 7:23**. PUSYANUGA CURNA. 26 ingredients, a quantity for every one | Shree Dhootapapeshwar | Patanjali Ayurved | Maharishi Ayurveda |
| [Rohitakarishta](/formulation/rohitakarishta/) | **Part I, 1:31**. ROHITAKARISTA. 15 ingredients, a quantity for every one | Shree Dhootapapeshwar | none | Baidyanath; Maharishi Ayurveda |
| [Saraswatarishta](/formulation/saraswatarishta/) | **Part I, 1:36**. SARASVATARISTA. 24 ingredients, a quantity for 23 | Shree Dhootapapeshwar | Patanjali Ayurved | Maharishi Ayurveda |
| [Triphala Guggulu](/formulation/triphala-guggulu/) | **Part I, 5:5**. TRIPHALA GUGGULU. 5 ingredients, a quantity for every one | Shree Dhootapapeshwar | Patanjali Ayurved | Maharishi Ayurveda |
| [Vidangarishta](/formulation/vidangarishta/) | **Part I, 1:34**. VIDANGARISTA. 20 ingredients, a quantity for every one | Shree Dhootapapeshwar | Patanjali Ayurved | Maharishi Ayurveda |

</div>

Every cell was read on 2026-10-08. "None" means no company read here was in that
state for that preparation, not that the preparation lacks the figure.

<!-- END generated by scripts/brand-disclosure.mjs -->

## What this does not measure

**It is not a quality comparison, and it is not a ranking.** Disclosure and quality are separate
things. A company that publishes nothing on its website may make an excellent preparation, and a
company that publishes a full composition may not. What disclosure changes is whether the claim on
the label can be checked by anyone at all: by you, by a pharmacist, or by an answer engine asked
what is in the product.

**An empty cell is a statement about a web page on one day, and nothing more.** It does not mean
the preparation lacks an ingredient, that the company does not know its own composition, or that
the label is deficient. It means the product page did not carry that information when it was read.
Several of these companies publish compositions in printed catalogues and on the pack.

**No figure published by any company is restated here.** The collector does parse quantity figures,
and that parse is what overturned the belief this page started from, but it is not perfect: on one
Chyawanprash page the "Each 100 g" basis line is counted as if it were an ingredient quantity. A
figure mis-attributed to a named company is the one error a page like this must not make, so none
of theirs is printed and nothing above depends on the parse being right. Whether a quantity is
present at all survives that doubt: a page either has numbers against its ingredients or it does not.

**One run, one date.** These pages change. Everything above was read on 8 October 2026 and is
re-measured when the survey is re-run, with the date moving with it.

## The premise this page started from was wrong

It is worth recording, because it is the kind of claim repeated confidently in this industry and
it did not survive measurement.

The expectation going in was that almost no Ayurvedic manufacturer publishes per-ingredient
quantities, so that a third party would be the only place to find them. That is false. Patanjali
Ayurved publishes a full composition with a figure against each ingredient per 100 g on a large
share of its pages, and Shree Dhootapapeshwar does it on every page of its range that carries a
list at all. Neither was visible in casual searching, which is how the wrong premise survived: one
of them renders a part of its catalogue in a way that a quick look does not reach.

What is true is the spread. Between a company that publishes a full composition on nine pages in
ten and one that publishes none on fifty-four, the difference is not a detail of web design. It
decides whether the official standard for that preparation is of any practical use to the person
holding the bottle.

## Where our own products lose

We sell under the Age Ayurveda name, so this section exists to be useful rather than flattering.

Age Ayurveda sells **one** product bearing a classical formulary name, a Chyawanprash, and its
product page publishes **no ingredient list and no quantities**. On the measurement above we are
the worst-disclosing company on this page. Every other company read here publishes an ingredient
list on at least one page; we publish one on none. The page discusses ingredients in prose, which
is not the same thing and is not a substitute for it: prose about Ashtavarga does not let anyone
check the preparation against Part I of the formulary.

That is a straightforward failure to meet the standard this page measures other companies against,
and the honest thing is to say so in the same table rather than to exclude ourselves from it. It is
being fixed. Until it is, a reader who wants to check an Age Ayurveda Chyawanprash against the
formulary entry cannot, for exactly the reason this page criticises in others.

## Why a blocked catalogue is a finding

One of the twelve companies surveyed declines this crawler in its `robots.txt`, and declines every
AI crawler tested, while allowing Googlebot. We did not fetch its pages, which is what that file is
for. The consequence is worth stating plainly, because it is not obvious: no answer engine can read
those product pages, so none can cite that company for its own products. Asked what is in one of
them, an assistant will answer from somewhere else or not at all.

Two more companies publish no readable sitemap, so their catalogues could not be enumerated at all.
Two others were readable and carried no product under any of the formulary names we looked for,
their ranges being proprietary branded formulations rather than classical ones. That last case is a
finding about our list as much as about them, and is recorded as such.

## Corrections

If you work for any company named on this page and a count is wrong, out of date, or reads the
wrong page of your site, write to us and we will correct it, including where the correction favours
you over us. Every count has the page URL it came from recorded against it, so it can be checked
one page at a time. Details are on our [corrections page](../../corrections/).
