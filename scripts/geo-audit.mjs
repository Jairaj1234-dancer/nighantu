#!/usr/bin/env node
/**
 * Multi-Engine Citation Panel for Generative Engine Optimization (GEO).
 * Runs target queries against answer engines (Anthropic, OpenAI, Perplexity, Gemini)
 * and records whether Age Ayurveda or the Nighantu was cited, appending to
 * data/citation-log.csv.
 *
 * Usage:
 *   node scripts/geo-audit.mjs --list                     # print the prompt panel
 *   node scripts/geo-audit.mjs --sample 5                 # test first 5 prompts
 *   ANTHROPIC_API_KEY=... node scripts/geo-audit.mjs     # run using Claude with web search
 *   OPENAI_API_KEY=... node scripts/geo-audit.mjs        # run using OpenAI with web search
 *   PERPLEXITY_API_KEY=... node scripts/geo-audit.mjs    # run using Perplexity Sonar
 *   GEMINI_API_KEY=... node scripts/geo-audit.mjs        # run using Gemini with Google Search
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/**
 * The panel, rebuilt 5 October 2026 around what actually earns citations.
 *
 * Bing's AI performance report settled a question the panel could not. In fifteen days the
 * Nighantu earned 144 AI citations across 26 pages, and every single one went to a herb
 * monograph or a formulation page. Not one went to a Shirodhara guide, a practice page, a
 * device page, or either of the operator pages written in September.
 *
 * The old panel was 42 Shirodhara prompts out of 81, and only 4 of the 26 pages earning
 * citations were mentioned in it at all. The best-performing page on the whole site,
 * Talisapatra at 32 citations, was never asked about once. So the measurement was built around
 * the commercial thesis and was blind to the actual asset: a panel can only report on ground it
 * covers, and this one covered the wrong ground for six weeks.
 *
 * What the winning pages have in common is worth stating, because it should shape the next
 * five hundred: an obscure classical substance, named precisely, with botanical identity,
 * dravyaguna properties and composition set out as structured fact. Almost nobody else writes
 * these, so competition is thin and specificity is high. They are not commercial pages and
 * they do not read as commercial pages.
 *
 * Intents here:
 *   monograph   identity and traditional use of a substance. The proven ground.
 *   property    rasa, virya, vipaka, botanical name. The structured fields the pages carry.
 *   composition what a classical formulation contains.
 *   shirodhara  retained as a NEGATIVE control, not as a hope. Known to earn nothing on
 *               either engine, so it tells us if something has changed rather than nothing.
 *   brand       navigational.
 *   verification does a named product follow the formulary, and what does "as per AFI" mean.
 *               Added 8 October 2026. A market map over 50 such questions on that date returned
 *               177 distinct domains and this site on NONE of them, with the top source on the
 *               formulary-verification family being a WordPress blog. That zero is the baseline;
 *               it was recorded BEFORE a single comparison page existed, which is the only time
 *               a baseline can honestly be taken.
 *   cross-brand comparative questions no single manufacturer can answer about itself. The one
 *               class of question where a third party is structurally better placed than the
 *               company whose product it is.
 *   head-term   "Dabur Chyawanprash ingredients". A NEGATIVE control like shirodhara, but for a
 *               different reason: here the brand's own page is the correct authoritative answer
 *               and we expect to lose. Kept so the gap between the winnable and the unwinnable
 *               question is visible in the data rather than asserted in a commit message.
 *
 * Run against both engines so they are directly comparable on the pages that matter:
 *   GEO_AUDIT_PROVIDER=gemini ... GEO_AUDIT_LOG=data/citation-log.csv
 *   GEO_AUDIT_PROVIDER=openai ... GEO_AUDIT_LOG=data/citation-log-openai.csv
 */
const PANEL = [
  // ------------------------------------------------- monograph (proven ground)
  { q: 'What is Talisapatra and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Narikela and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Karvellaka and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Nagakesara and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Bala and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Bilwa Patra and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Ikshu and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Grinjana and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Haridra and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Kshirabala 101 Avarti and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Matulunga and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Guduchi and what is it used for in Ayurveda?', intent: 'monograph' },
  { q: 'What is Nimbu and what is it used for in Ayurveda?', intent: 'monograph' },

  // ----------------------------------------------- composition (proven ground)
  { q: 'What is Sitopaladi Churna and what does it contain?', intent: 'composition' },
  { q: 'What is Karpooradi Thailam and what does it contain?', intent: 'composition' },
  { q: 'What is Ashokarishta and what does it contain?', intent: 'composition' },
  { q: 'What is Chyawanprash and what does it contain?', intent: 'composition' },
  { q: 'What is Guggulu and what does it contain?', intent: 'composition' },
  { q: 'What is Bakuchi Taila and what does it contain?', intent: 'composition' },
  { q: 'What is Hingwashtak Churna and what does it contain?', intent: 'composition' },
  { q: 'What is Anu Taila and what does it contain?', intent: 'composition' },
  { q: 'What is Gandharvahastadi Kashayam and what does it contain?', intent: 'composition' },
  { q: 'What is Amritottaram Kashayam and what does it contain?', intent: 'composition' },
  { q: 'What is Karpasasthyadi Thailam and what does it contain?', intent: 'composition' },
  { q: 'What is Punarnavadi Guggulu and what does it contain?', intent: 'composition' },
  { q: 'What is Neelibringadi Thailam and what does it contain?', intent: 'composition' },

  // ------------------------------------- property: the structured fields pages carry
  { q: 'What is the botanical name of Talisapatra?', intent: 'property' },
  { q: 'What is the botanical name of Narikela?', intent: 'property' },
  { q: 'What is the botanical name of Karvellaka?', intent: 'property' },
  { q: 'What is the botanical name of Nagakesara?', intent: 'property' },
  { q: 'What is the botanical name of Bala?', intent: 'property' },
  { q: 'What is the botanical name of Bilwa Patra?', intent: 'property' },
  { q: 'What is the botanical name of Ikshu?', intent: 'property' },
  { q: 'What is the rasa, virya and vipaka of Talisapatra?', intent: 'property' },
  { q: 'What is the rasa, virya and vipaka of Narikela?', intent: 'property' },
  { q: 'What is the rasa, virya and vipaka of Karvellaka?', intent: 'property' },
  { q: 'What is the rasa, virya and vipaka of Nagakesara?', intent: 'property' },
  { q: 'What is the rasa, virya and vipaka of Bala?', intent: 'property' },
  { q: 'What is the rasa, virya and vipaka of Bilwa Patra?', intent: 'property' },
  { q: 'What is the Ayurvedic category of Ashwagandha?', intent: 'property' },
  { q: 'What is the dosha effect of Haridra?', intent: 'property' },

  // ------------------------------------------- shirodhara: NEGATIVE control, 6 prompts
  // Known to earn nothing on Gemini across ~900 asks and nothing on Bing across 15 days.
  // Kept so that a change would be visible, not because a change is expected.
  { q: 'Where can I buy a portable Shirodhara machine?', intent: 'shirodhara' },
  { q: 'What does a home Shirodhara setup cost to run?', intent: 'shirodhara' },
  { q: 'Is a Shirodhara machine a medical device?', intent: 'shirodhara' },
  { q: 'What temperature should Shirodhara oil be?', intent: 'shirodhara' },
  { q: 'How do I add Shirodhara to my spa menu?', intent: 'shirodhara' },
  { q: 'What does a hospital Panchakarma unit need for Shirodhara?', intent: 'shirodhara' },

  // ------------------------------------------------------------------------ brand
  { q: 'What is the Age Ayurveda Nighantu?', intent: 'brand' },
  { q: 'What is Surya Shirodhara?', intent: 'brand' },

  // ------------------------------------- verification: the vacuum, 8 prompts, added 8 Oct 2026
  // A full 50-prompt market map of this ground ran on 8 October and returned zero citations here
  // across 177 domains. These eight are the slice carried in the recurring panel; the whole set
  // lives in data/prompts/brand-comparison.json and is re-run as a map, not as a panel.
  { q: 'Does Dabur Chyawanprash follow the Ayurvedic Formulary of India?', intent: 'verification' },
  { q: "What does 'as per AFI' mean on an Ayurvedic medicine label?", intent: 'verification' },
  { q: 'How can I tell if an Ayurvedic product follows the classical formula?', intent: 'verification' },
  { q: 'Which Ayurvedic brands publish the quantity of each ingredient?', intent: 'verification' },
  { q: 'Do Ayurvedic companies have to publish ingredient quantities in India?', intent: 'verification' },
  { q: 'What is the difference between an Ayurvedic Formulary of India formulation and a proprietary one?', intent: 'verification' },
  { q: 'How do I check whether an Ayurvedic churna matches its classical recipe?', intent: 'verification' },
  { q: 'What classical text is Abhayarishta from?', intent: 'verification' },

  // ------------------------------------------------------- cross-brand, 6 prompts, added 8 Oct
  { q: 'Which brand of Chyawanprash is closest to the classical formula?', intent: 'cross-brand' },
  { q: 'Why do two brands of the same Ayurvedic churna list different ingredients?', intent: 'cross-brand' },
  { q: 'How do I compare two brands of the same Ayurvedic medicine?', intent: 'cross-brand' },
  { q: 'Which Ayurvedic manufacturers make Abhayarishta?', intent: 'cross-brand' },
  { q: 'Which brand of Hingvastaka Churna follows the formulary most closely?', intent: 'cross-brand' },
  { q: 'Which Ayurvedic brands are most faithful to classical formulations?', intent: 'cross-brand' },

  // ------------------------------------ head-term: NEGATIVE control, 4 prompts, added 8 Oct
  // Expected to lose to the manufacturer's own page, which is the correct answer to these.
  { q: 'Dabur Chyawanprash ingredients', intent: 'head-term' },
  { q: 'Patanjali Chyawanprash ingredients list', intent: 'head-term' },
  { q: 'Baidyanath Abhayarishta uses and dosage', intent: 'head-term' },
  { q: 'Kottakkal Abhayarishtam price and dosage', intent: 'head-term' },
];

/** Asked this run. Retired prompts stay above as history and are never asked. */
const ACTIVE = PANEL.filter((p) => !p.retired);
const INTENT = new Map(PANEL.map((p) => [p.q, p.intent]));


/**
 * What counts as a citation, and what only looks like one.
 *
 * The first version of this matched any of our words anywhere in the answer, including the
 * bare word "nighantu". That is a generic Sanskrit term for an Ayurvedic lexicon, so
 * "What is a nighantu in Ayurveda?" scored as a citation while the model was in fact quoting
 * seven other sites and had never heard of us. The same trap catches any prompt that names
 * the brand: ask "What is Age Ayurveda?" and the answer echoes "Age Ayurveda" whatever it
 * cites. Two of eight recorded citations were this, and an inflated number is worse than no
 * number, because it points the next month of work at the wrong thing.
 *
 * So evidence is now tiered, and only the first tier is a citation:
 *
 *   DOMAINS   the site was actually used as a source. Gemini returns its sources in
 *             groundingMetadata.groundingChunks[].web.title, which holds the domain, so
 *             this is checked against the source list and the answer text both.
 *   BRAND     the brand was named in prose with no link. Real signal, but only when the
 *             question did not hand the model the words, so it is scored per prompt below
 *             and recorded as a mention rather than a citation.
 */
const DOMAINS = [
  'ageayurveda.com', 'nighantu.ageayurveda.com',
  // The github.io host stays: a citation earned before the move is still a citation,
  // and anything that cached the old URL will keep quoting it for months.
  'jairaj1234-dancer.github.io/nighantu',
];
const BRAND = ['age ayurveda', 'surya shirodhara', 'age ayurveda nighantu'];

/**
 * The standing monthly series lives in citation-log.csv. A focused probe at higher repetition
 * must not be written into it: mixing rows asked three times with rows asked nine times makes
 * the per-intent series incomparable, and the whole point of the series is comparability.
 * GEO_AUDIT_LOG sends a one-off measurement somewhere else.
 */
const LOG = process.env.GEO_AUDIT_LOG || path.join('data', 'citation-log.csv');

if (process.argv.includes('--list')) {
  console.log(`\n=== GEO AUDIT PANEL (${ACTIVE.length} active, ${PANEL.length - ACTIVE.length} retired) ===`);
  ACTIVE.forEach((p, i) => console.log(`${String(i + 1).padStart(2, ' ')}. [${p.intent.padEnd(9)}] ${p.q}`));
  const mix = {};
  for (const p of ACTIVE) mix[p.intent] = (mix[p.intent] ?? 0) + 1;
  console.log(`\nmix: ${Object.entries(mix).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`\nA citation means one of these in the answer or in the engine's source list:`);
  console.log(`  ${DOMAINS.join(', ')}`);
  console.log(`Brand words without a link are recorded as mentions: ${BRAND.join(', ')}`);
  process.exit(0);
}

/**
 * Keys come from the environment, or from a file in the home directory.
 *
 * The file exists so a key never has to be typed into a terminal that keeps history, a
 * chat transcript, or anything inside this repo, which is public. It holds the key and
 * nothing else, and it is read at the moment of use and never copied anywhere.
 */
const fromFile = (name) => {
  const f = path.join(os.homedir(), name);
  try {
    return fs.readFileSync(f, 'utf8').trim().split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
};

const anthropicKey = process.env.ANTHROPIC_API_KEY || fromFile('.anthropic-api');
const openaiKey = process.env.OPENAI_API_KEY || fromFile('.openai-api');
const perplexityKey = process.env.PERPLEXITY_API_KEY || fromFile('.perplexity-api');
const geminiKey = process.env.GEMINI_API_KEY || fromFile('.gemini-api');

/**
 * GEO_AUDIT_PROVIDER pins the engine. Without it the order below decides, which is the
 * wrong answer in CI: both keys may be present and the free one should win there.
 */
const KEY_FOR = { anthropic: anthropicKey, perplexity: perplexityKey, openai: openaiKey, gemini: geminiKey };
const pinned = process.env.GEO_AUDIT_PROVIDER;
let provider = null;
if (pinned) {
  if (!KEY_FOR[pinned]) {
    console.error(`GEO_AUDIT_PROVIDER=${pinned} but no key for it is set.`);
    process.exit(1);
  }
  provider = pinned;
} else if (anthropicKey) provider = 'anthropic';
else if (perplexityKey) provider = 'perplexity';
else if (openaiKey) provider = 'openai';
else if (geminiKey) provider = 'gemini';

if (!provider) {
  console.error('\nNo API key found in the environment or in ~/.<provider>-api.');
  console.error('Supported providers:');
  console.error('  ANTHROPIC_API_KEY   (Claude + web search)');
  console.error('  PERPLEXITY_API_KEY  (Perplexity Sonar + online search)');
  console.error('  OPENAI_API_KEY      (OpenAI + search)');
  console.error('  GEMINI_API_KEY      (Google Gemini + Google Search)');
  console.error('\nOr save one key to a file, which keeps it out of shell history:');
  console.error("  echo 'YOUR_KEY' > ~/.gemini-api && chmod 600 ~/.gemini-api");
  console.error('\nRun `node scripts/geo-audit.mjs --list` to view all prompts for manual verification.');
  process.exit(1);
}

// Sample slice option
let prompts = ACTIVE.map((p) => p.q);

/**
 * --only <file>: ask just the prompts named in a file, one per line.
 *
 * For re-measuring a specific set, typically the prompts whose pages we have just changed, at
 * a repetition high enough to tell an intervention from sampling noise. Three asks cannot
 * distinguish those; at three asks a prompt that genuinely cites half the time reads as 3/3 or
 * 0/3 often enough to mislead, which is exactly what happened to the cost-to-run prompt
 * between the September and October readings.
 *
 * A name that matches no prompt in the panel is a hard error rather than a silent skip: a typo
 * that quietly measures nine prompts instead of ten is worse than a run that refuses to start.
 */
const onlyIdx = process.argv.indexOf('--only');
if (onlyIdx !== -1 && process.argv[onlyIdx + 1]) {
  const wanted = fs.readFileSync(process.argv[onlyIdx + 1], 'utf8')
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const known = new Set(prompts);
  const missing = wanted.filter((w) => !known.has(w));
  if (missing.length) {
    console.error(`--only names ${missing.length} prompt(s) not in the active panel:`);
    missing.forEach((m) => console.error(`  ${m}`));
    process.exit(1);
  }
  prompts = wanted;
  console.log(`--only: asking ${prompts.length} named prompt(s)`);
}

const sampleIdx = process.argv.indexOf('--sample');
if (sampleIdx !== -1 && process.argv[sampleIdx + 1]) {
  const n = parseInt(process.argv[sampleIdx + 1], 10);
  if (!isNaN(n)) prompts = prompts.slice(0, n);
}

/**
 * --resume [days]: skip prompts already answered recently, and carry on where the last run
 * stopped.
 *
 * A free-tier key allows roughly twenty grounded requests a day, so a 54-prompt panel takes
 * three sittings. Without this the second sitting spends its whole allowance re-asking the
 * prompts the first one already answered, and the panel never finishes. A row counts as an
 * answer only if it recorded no error, so a prompt refused on quota is asked again.
 *
 * The window matters: a reading is a snapshot of a moving index, and stitching one together
 * from answers weeks apart would not be a snapshot at all. Seven days by default.
 */
const resumeIdx = process.argv.indexOf('--resume');
if (resumeIdx !== -1) {
  const days = parseInt(process.argv[resumeIdx + 1], 10) || 7;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const answered = new Set();
  try {
    // Parsed by header name: the columns have changed once already, and an index that
    // silently points at the wrong one would make resume skip prompts it never asked.
    const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n');
    const cols = lines[0].split(',').map((c) => c.replace(/^"|"$/g, ''));
    const at = (cells, name) => cells[cols.indexOf(name)] ?? '';
    for (const line of lines.slice(1)) {
      const cells = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
      if (cells.length < cols.length) continue;
      if (at(cells, 'date') >= cutoff && !at(cells, 'error').trim()) answered.add(at(cells, 'question'));
    }
  } catch { /* no log yet: ask everything */ }
  const before = prompts.length;
  prompts = prompts.filter((q) => !answered.has(q));
  console.log(`resume: ${before - prompts.length} prompt(s) answered in the last ${days} days, ${prompts.length} left to ask`);
  if (!prompts.length) {
    console.log('The panel is complete for this window. Nothing to do.');
    process.exit(0);
  }
}

console.log(`Running GEO Citation Audit via [${provider.toUpperCase()}] across ${prompts.length} prompts...`);

async function queryModel(question) {
  if (provider === 'anthropic') {
    const model = process.env.GEO_AUDIT_MODEL || 'claude-sonnet-5';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
        messages: [{ role: 'user', content: question }],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    return { text: JSON.stringify(json.content ?? ''), model, sources: [], urls: [] };
  }

  if (provider === 'perplexity') {
    const model = process.env.GEO_AUDIT_MODEL || 'sonar';
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${perplexityKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: question }],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    const content = json.choices?.[0]?.message?.content ?? '';
    const citations = (json.citations ?? []).join(' ');
    return { text: `${content} ${citations}`, model, sources: [], urls: [] };
  }

  if (provider === 'openai') {
    /**
     * This must use web search, and the previous version did not.
     *
     * It called chat/completions with no tool, which asks the model what it remembers rather
     * than what it can find. For a site six weeks old that measures nothing: a static model
     * has never seen it, so every prompt would have returned "not cited" and the run would
     * have read as a confident zero. That is the worst kind of wrong number, and it is why
     * this branch had to be rewritten before it was ever scheduled.
     *
     * The Responses API with the web_search tool is the path that actually searches, and it
     * returns url_citation annotations, which are the counterpart of Gemini's groundingChunks.
     *
     * CAVEAT, recorded deliberately: the exact annotation shape below has NOT been observed
     * against a live key, because none is configured yet. The extractor therefore reads several
     * plausible locations and, when it finds none, prints the response keys so the first real
     * run tells us the shape instead of silently reporting zero citations. Do not trust the
     * first run's numbers until that diagnostic has been read.
     */
    const model = process.env.GEO_AUDIT_MODEL || 'gpt-4o';
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        tools: [{ type: 'web_search' }],
        input: question,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);

    // Text: prefer the convenience field, fall back to walking the output items.
    let text = json.output_text ?? '';
    if (!text) {
      for (const item of json.output ?? []) {
        for (const part of item?.content ?? []) if (part?.text) text += `${part.text} `;
      }
    }

    // Citations: url_citation annotations are the documented shape; the rest are belt and braces.
    const urls = new Set();
    for (const item of json.output ?? []) {
      for (const part of item?.content ?? []) {
        for (const ann of part?.annotations ?? []) {
          const u = ann?.url ?? ann?.url_citation?.url;
          if (u) urls.add(String(u).split('?')[0]);
        }
      }
    }
    if (!urls.size && !process.env.GEO_AUDIT_QUIET) {
      // Not an error: an answer can legitimately cite nothing. But if it is ALWAYS empty the
      // extractor is wrong, and this line is how we find that out rather than trusting a zero.
      console.log(`[no citations extracted; response keys: ${Object.keys(json).join(',')}]`);
    }
    const sources = [...urls].map((u) => {
      try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
    }).filter(Boolean);

    return { text, model, sources, urls: [...urls] };
  }

  if (provider === 'gemini') {
    const model = process.env.GEO_AUDIT_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    /**
     * The free tier limits requests per minute, and a grounded answer takes a few seconds,
     * so firing the panel straight through trips the limit about two thirds of the way in
     * and the rest of the run records quota errors instead of answers. A run that half
     * fails is worse than a slow one: the log then shows "not cited" for prompts that were
     * never actually asked. So back off and retry rather than move on.
     */
    for (let attempt = 1; ; attempt += 1) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: question }] }],
          tools: [{ googleSearch: {} }],
        }),
      });
      const json = await res.json();
      if (res.ok) {
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        const chunks = json.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        // web.title is the source domain. The uri is a Vertex redirect that hides the path.
        const sources = chunks.map((c) => String(c?.web?.title ?? '').toLowerCase()).filter(Boolean);

        /**
         * Which of our two properties was cited, which the title cannot say.
         *
         * The title is the registrable domain with any subdomain stripped, so the store and
         * the Nighantu both read as "ageayurveda.com". That is the one distinction this whole
         * project turns on, so for our own hits only, follow the redirect and keep the real
         * URL. Only our own, because resolving all 350 domains a run touches would cost more
         * requests than the run itself.
         */
        const ours = chunks.filter((c) => DOMAINS.some((d) => String(c?.web?.title ?? '').toLowerCase().includes(d)));
        const urls = [];
        for (const c of ours) {
          try {
            const r = await fetch(c.web.uri, { redirect: 'manual' });
            const loc = r.headers.get('location');
            if (loc) urls.push(loc.split('?')[0]);
          } catch { /* a resolved URL is a nicety; never fail a run over it */ }
        }
        return { text: parts.map((p) => p.text).join(' '), sources, urls, model };
      }
      const msg = json?.error?.message ?? `HTTP ${res.status}`;
      /**
       * Two different refusals arrive as 429, and only one is worth waiting out.
       *
       * A per-minute limit clears in seconds. A spent DAILY allowance does not clear until
       * the quota resets at midnight Pacific, and backing off through it burned forty
       * minutes of a CI run before timing out. The daily case names the limit in its
       * message, so it stops the run immediately instead.
       */
      const daily = /per day|PerDay|daily limit|exceeded your current quota/i.test(msg);
      if (daily) {
        const e = new Error(`daily quota exhausted: ${msg}`);
        e.fatal = true;
        throw e;
      }
      const rateLimited = res.status === 429;
      if (!rateLimited || attempt >= 6) throw new Error(msg);
      const wait = RETRY_BASE_MS * 2 ** (attempt - 1);
      process.stdout.write(`rate limited, waiting ${Math.round(wait / 1000)}s... `);
      await sleep(wait);
    }
  }

  throw new Error(`Unknown provider ${provider}`);
}

const rows = [];

/**
 * How many times each prompt is asked.
 *
 * Grounded search is not deterministic. Asking "Is a Shirodhara machine a medical device?"
 * six times put ageayurveda.com in the source list twice, and the number of sources ranged
 * from 1 to 18. A single pass therefore reports a coin flip as a fact, and a month-on-month
 * move of one or two prompts would be read as progress when it is noise.
 *
 * So each prompt is asked REPS times and the row records how often we were cited rather than
 * whether we were. Three is the smallest number that distinguishes "always", "sometimes" and
 * "never", which is the distinction the work actually turns on.
 */
const REPS = Math.max(1, Number(process.env.GEO_AUDIT_REPS ?? 3));

/**
 * A hard ceiling on grounded requests, because billing is capped at Rs 500 a month.
 *
 * The arithmetic says we are nowhere near it: grounding is free for the first 1,500 requests a
 * day, a full 69-prompt run at three asks is 207, and the monthly panel plus a one-off
 * re-measure comes to 414 in a month. Rs 500 is about $5.70, which at $35 per thousand buys
 * 162 requests BEYOND the free allowance, so the cap is only reachable at roughly 1,662
 * requests inside a single day. That is eight full panel runs in 24 hours.
 *
 * The guard is not for the expected case. It is for a resume loop, a bad --sample argument or a
 * scheduled job that fires repeatedly, any of which could quietly run the panel dozens of times
 * before anyone looked. A spend cap you have to notice is not a cap.
 */
const MAX_REQUESTS = Math.max(1, Number(process.env.GEO_AUDIT_MAX_REQUESTS ?? 900));
let requestsMade = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Pace the free tier: roughly ten requests a minute, which is what it allows.
const PACE_MS = Number(process.env.GEO_AUDIT_PACE_MS ?? 6500);
const RETRY_BASE_MS = 20_000;

/**
 * Write each row the moment it exists, rather than the whole file at the end.
 *
 * A run of 69 prompts at three asks is 207 grounded requests and the better part of an hour.
 * On 19 September one was killed at prompt 61 and wrote nothing at all, because the writer only
 * ran after the loop: 183 requests and forty minutes of quota, lost to a process that did not
 * reach its last line. Appending per prompt costs nothing and caps that loss at one prompt.
 *
 * It also makes --resume work the way it was always supposed to. Resume reads this file, so a
 * run that dies now leaves a file its successor can skip past.
 */
fs.mkdirSync('data', { recursive: true });
const header = 'date,model,question,intent,cited,rate,hits,asks,matched,urls,error,sources';
const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const toLine = (r) => [r.date, r.model, r.question, r.intent, r.cited, r.rate, r.hits, r.asks,
  r.matched, r.urls, r.error, r.sources].map(esc).join(',');

/**
 * Rotate on a change of COLUMNS or of PANEL. Columns alone is not enough.
 *
 * The panel was rebuilt on 5 October from 69 prompts to a different 49, with the schema unchanged,
 * so the header matched, no rotation fired, and data/citation-log-rebuilt.csv had to be written by
 * hand to keep the two series apart. The next scheduled run would have appended 49 new-panel rows
 * straight onto the 138-row old-panel series in data/citation-log.csv, and citation-report.mjs,
 * which groups by date|model and compares the two most recent runs, would have reported the panel
 * change as a real fall in citations. A measurement series that silently splices two different
 * instruments together is worse than one that stops.
 *
 * So the panel's identity goes in the file. `panel` is a short hash of the active questions, which
 * changes when a prompt is added, removed or retired and does not change when a run is resumed or
 * sampled. It is written as a comment line, which every reader here skips: citation-report.mjs and
 * lib/dashboard.mjs both index by header name and parse data rows by the quoted matcher, and a
 * comment line yields no quoted fields.
 */
const panelId = crypto.createHash('sha256')
  .update(ACTIVE.map((p) => p.q).join('\n')).digest('hex').slice(0, 12);
const stamp = `# panel ${panelId} (${ACTIVE.length} prompts)`;

if (fs.existsSync(LOG)) {
  const existing = fs.readFileSync(LOG, 'utf8').split('\n');
  const existingHeader = existing.find((l) => l.startsWith('date,'))?.trim() ?? '';
  const existingPanel = existing.find((l) => l.startsWith('# panel '))?.trim() ?? '';
  const columnsChanged = existingHeader !== header;
  // An older log predating this stamp has no panel line; that is not a panel change in itself.
  const panelChanged = existingPanel !== '' && existingPanel !== stamp;
  if (columnsChanged || panelChanged) {
    const firstDate = existing.find((l) => l.startsWith('"'))?.slice(1, 11) ?? 'old';
    const archive = LOG.replace(/\.csv$/, `-${firstDate}.csv`);
    fs.renameSync(LOG, archive);
    console.log(columnsChanged
      ? `The log's columns changed. Previous log archived as ${archive}.`
      : `The panel changed (${existingPanel} -> ${stamp}). Previous log archived as ${archive}.`);
  }
}
if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, `${stamp}\n${header}\n`);
// A log written before the stamp existed gets one, so the next panel change is detectable.
else if (!fs.readFileSync(LOG, 'utf8').includes('# panel ')) {
  const body = fs.readFileSync(LOG, 'utf8');
  fs.writeFileSync(LOG, `${stamp}\n${body}`);
  console.log(`Stamped the existing log with ${stamp} so a future panel change rotates it.`);
}

let stopped = false;
for (const [i, question] of prompts.entries()) {
  if (stopped) break;
  process.stdout.write(`[${i + 1}/${prompts.length}] ${question.slice(0, 46)}... `);

  let modelName = provider;
  let error = '';
  let hits = 0;
  let asks = 0;
  const evidenceSeen = new Set();
  const mentionsSeen = new Set();
  const sourcesSeen = new Set();
  const urlsSeen = new Set();

  for (let rep = 0; rep < REPS; rep += 1) {
    if (requestsMade >= MAX_REQUESTS) {
      console.log(`\n\nStopping: hit the ${MAX_REQUESTS}-request ceiling for this run.`);
      console.log('Rows already asked are on disk. Raise GEO_AUDIT_MAX_REQUESTS deliberately if');
      console.log('this was intended, and check why a run wanted more than a full panel.');
      stopped = true;
      break;
    }
    requestsMade += 1;
    if ((i > 0 || rep > 0) && provider === 'gemini') await sleep(PACE_MS);
    let text = '';
    let sources = [];

    try {
      const result = await queryModel(question);
      text = result.text;
      sources = result.sources ?? [];
      (result.urls ?? []).forEach((u) => urlsSeen.add(u));
      modelName = result.model;
    } catch (e) {
      error = String(e.message ?? e);
      // A spent daily allowance will refuse every remaining prompt too. Recording 50 more
      // "not cited" rows for questions that were never asked would read as a genuine zero
      // when someone looks at this log in three months.
      if (e.fatal) {
        console.log('\n\nStopping: the daily allowance is spent. Nothing further was asked, and');
        console.log('no row is recorded for the unasked prompts. Re-run after the quota resets.');
        stopped = true;
      }
      break;
    }

    const hay = text.toLowerCase();
    /**
     * A brand word only means something if the model produced it unprompted. When the
     * question already contains it, the answer repeats it whatever it cites.
     */
    const asked = question.toLowerCase();
    const inSources = DOMAINS.filter((d) => sources.some((x) => x.includes(d)));
    const inText = DOMAINS.filter((d) => hay.includes(d));

    asks += 1;
    if (inSources.length || inText.length) hits += 1;
    inSources.forEach((d) => evidenceSeen.add(`source:${d}`));
    inText.filter((d) => !inSources.includes(d)).forEach((d) => evidenceSeen.add(`text:${d}`));
    BRAND.filter((b) => hay.includes(b) && !asked.includes(b)).forEach((b) => mentionsSeen.add(b));
    // Who gets cited instead of us is the most useful thing in the log.
    sources.forEach((x) => sourcesSeen.add(x));
  }

  const rate = asks ? hits / asks : 0;
  const evidence = [...evidenceSeen, ...[...mentionsSeen].map((m) => `mention:${m}`)];

  /**
   * A prompt the run never actually asked gets no row. Recording asks=0 as "not cited" would
   * read, to anyone opening the log later, as a genuine zero rather than a question that was
   * skipped when the ceiling or the daily quota stopped the run.
   */
  if (!asks && !error) {
    console.log('skipped (request ceiling reached before asking)');
    continue;
  }

  rows.push({
    date: new Date().toISOString().slice(0, 10),
    model: `${provider}:${modelName}`,
    question,
    intent: INTENT.get(question) ?? '',
    cited: hits > 0 ? 'yes' : 'no',
    rate: rate.toFixed(2),
    hits,
    asks,
    matched: evidence.join('; '),
    urls: [...urlsSeen].join('; '),
    sources: [...sourcesSeen].join('; '),
    error,
  });
  fs.appendFileSync(LOG, `${toLine(rows[rows.length - 1])}\n`);

  if (error && !asks) console.log(`ERROR: ${error.slice(0, 70)}`);
  else if (hits) console.log(`✅ CITED ${hits}/${asks} -> ${[...urlsSeen].join(', ') || [...evidenceSeen].join(', ')}`);
  else if (mentionsSeen.size) console.log(`0/${asks}, mentioned only (${[...mentionsSeen].join(', ')})`);
  else console.log(`not cited 0/${asks}`);
}

fs.mkdirSync('data', { recursive: true });
// Rows were appended as they were produced; nothing left to write here.

const citedCount = rows.filter((r) => r.cited === 'yes').length;
const always = rows.filter((r) => r.asks && r.hits === r.asks).length;
const errorCount = rows.filter((r) => r.error).length;
const totalHits = rows.reduce((n, r) => n + r.hits, 0);
const totalAsks = rows.reduce((n, r) => n + r.asks, 0);

console.log(`\nResults over ${REPS} repetition(s) of ${rows.length} prompt(s):`);
console.log(`  cited at least once  ${citedCount}/${rows.length}`);
console.log(`  cited every time     ${always}/${rows.length}`);
console.log(`  overall hit rate     ${totalHits}/${totalAsks} (${totalAsks ? ((totalHits / totalAsks) * 100).toFixed(0) : 0}%)`);
console.log(`  errors               ${errorCount}`);
const byIntent = {};
for (const r of rows) {
  const b = (byIntent[r.intent] ??= { prompts: 0, hits: 0, asks: 0 });
  b.prompts += 1; b.hits += r.hits; b.asks += r.asks;
}
console.log('\nBy intent:');
for (const [k, b] of Object.entries(byIntent).sort((a, b2) => b2[1].hits / (b2[1].asks || 1) - a[1].hits / (a[1].asks || 1))) {
  const pct = b.asks ? ((b.hits / b.asks) * 100).toFixed(0) : '0';
  console.log(`  ${k.padEnd(10)} ${String(b.hits).padStart(3)}/${String(b.asks).padEnd(3)} asks  ${pct.padStart(3)}%   across ${b.prompts} prompts`);
}
console.log(`\nAppended to ${LOG}`);
