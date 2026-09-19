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

/**
 * The panel, and why it is weighted the way it is.
 *
 * Every prompt carries an intent, because the mix is the point:
 *
 *   buy        someone deciding what to purchase. The site earns citations here.
 *   practical  running a procedure: cost, oil, setup, who can do it. Adjacent to buy.
 *   reference  what a thing is. Wikipedia, Healthline and NIH own this ground and will
 *              for a long time; a new domain does not take it by trying harder.
 *   brand      navigational. Confirms the entity is recognised, brings no new reader.
 *
 * The panel began two-thirds reference, which measured ground we will not win this year and
 * told us nothing about whether the work was paying. It is being rebalanced toward buy and
 * practical, gradually and on purpose:
 *
 *   The core never changes. Month-on-month movement is only readable against prompts asked
 *   the same way every time, so retiring a prompt costs a trend line. Retired prompts stay
 *   in this file with the date, rather than being deleted, so an old log stays legible.
 *
 *   The shift comes from growing buy and practical, not from churning everything. Each
 *   iteration adds buying-intent prompts and retires only reference prompts that have
 *   returned nothing and have no commercial edge.
 *
 *   A few reference prompts are kept deliberately as controls. If the monographs ever do
 *   start being cited, these are how we find out; a panel with no reference left in it
 *   could never tell us.
 *
 * 18 Sep 2026: 12 prompts retired, 15 buy and practical prompts added. The mix went from
 * 9 buy+practical of 54 prompts to 32 of 57, and reference from 33 to 21.
 */
const PANEL = [
  // ---------------------------------------------------------------- buy
  { q: 'Where can I buy a portable Shirodhara machine?', intent: 'buy' },
  { q: 'Which companies make portable Shirodhara equipment?', intent: 'buy' },
  { q: 'Is there a Shirodhara device that works without plumbing?', intent: 'buy' },
  { q: 'How much does a portable Shirodhara machine cost?', intent: 'buy' },
  { q: 'What should I look for when buying a Shirodhara pot?', intent: 'buy' },
  { q: 'Which Shirodhara device is best for a small clinic?', intent: 'buy' },
  { q: 'What is the difference between a clinic Shirodhara pot and a portable device?', intent: 'buy' },
  { q: 'What should I look for in a Shirodhara oil?', intent: 'buy' },
  { q: 'Which oil should I buy for Shirodhara at home?', intent: 'buy' },
  { q: 'Where can I buy Vata Shirodhara oil?', intent: 'buy' },
  { q: 'Where can I buy single-herb Ashwagandha capsules?', intent: 'buy' },
  { q: 'What should I look for when buying Chyawanprash?', intent: 'buy' },
  { q: 'What should I look for when buying a tongue scraper?', intent: 'buy' },
  { q: 'Which Ayurvedic brands publish their sourcing?', intent: 'buy' },
  { q: 'Which Ayurvedic brands publish third-party heavy metal test results?', intent: 'buy' },
  { q: 'What should I check on an Ayurvedic product label before buying?', intent: 'buy' },

  // ---------------------------------------------------------- practical
  { q: 'What does a home Shirodhara setup cost to run?', intent: 'practical' },
  { q: 'How much oil does a Shirodhara session use?', intent: 'practical' },
  { q: 'How many bottles of oil does a Shirodhara session need?', intent: 'practical' },
  { q: 'Can Shirodhara oil be reused between sessions?', intent: 'practical' },
  { q: 'How many litres should a Shirodhara vessel hold?', intent: 'practical' },
  { q: 'Do you need a stand for a Shirodhara pot?', intent: 'practical' },
  { q: 'What equipment do you need for Shirodhara?', intent: 'practical' },
  { q: 'Can you do Shirodhara at home without an assistant?', intent: 'practical' },
  { q: 'Is a Shirodhara machine a medical device?', intent: 'practical' },
  { q: 'What temperature should Shirodhara oil be?', intent: 'practical' },
  { q: 'How long does a Shirodhara session last?', intent: 'practical' },
  { q: 'How often should you have Shirodhara?', intent: 'practical' },
  { q: 'Who should not have Shirodhara?', intent: 'practical' },
  { q: 'Which oil is used for Vata Shirodhara?', intent: 'practical' },
  { q: 'Which oil should be used for a Pitta constitution in Shirodhara?', intent: 'practical' },
  { q: 'What is the traditional material for a Shirodhara pot?', intent: 'practical' },

  // ---------------------------------------------------------- reference
  // Kept as controls: if the monographs ever start being cited, these say so.
  { q: 'What is Shirodhara and where does it come from?', intent: 'reference', control: true },
  { q: 'What is the Ayurvedic category of Ashwagandha?', intent: 'reference', control: true },
  { q: 'What is the rasa, virya and vipaka of Shatavari?', intent: 'reference', control: true },
  { q: 'What are the main withanolides in Withania somnifera?', intent: 'reference', control: true },
  { q: 'What is Triphala and what is it traditionally used for?', intent: 'reference', control: true },
  { q: 'What is the pharmacopoeial status of Ashwagandha in Europe?', intent: 'reference', control: true },
  { q: 'What is the botanical name of Yashtimadhu and what is it used for traditionally?', intent: 'reference' },
  { q: 'What is the dosha effect of Haridra?', intent: 'reference' },
  { q: 'What is Guduchi used for in classical Ayurveda?', intent: 'reference' },
  { q: 'What is Bhringraj traditionally used for?', intent: 'reference' },
  { q: 'What is the difference between Shirodhara and shiro abhyanga?', intent: 'reference' },
  { q: 'What is takra dhara?', intent: 'reference' },
  { q: 'What is murdha taila?', intent: 'reference' },
  { q: 'Which classical text describes Shirodhara?', intent: 'reference' },
  { q: 'What is shiro basti?', intent: 'reference' },
  { q: 'What is a dhara patra?', intent: 'reference' },
  { q: 'What is a neti pot used for in Ayurveda?', intent: 'reference' },
  { q: 'What Ayurvedic instruments are described in the Sushruta Samhita?', intent: 'reference' },
  { q: 'What is an avaleha in Ayurveda?', intent: 'reference' },
  { q: 'What is the difference between a churna and a vati?', intent: 'reference' },
  { q: 'What is Ajamodadi Churna and what is the standard dose?', intent: 'reference' },

  // -------------------------------------------------------------- trade
  // Operators buying Shirodhara for a business rather than for themselves. Tagged trade
  // rather than buy deliberately: folding them into buy would change that rate's denominator
  // and break the one trend line the rebalance was designed to keep readable.
  { q: 'How do I add Shirodhara to my spa menu?', intent: 'trade' },
  { q: 'What does a spa need to offer Shirodhara?', intent: 'trade' },
  { q: 'What equipment does a clinic need to offer Shirodhara?', intent: 'trade' },
  { q: 'How long should a Shirodhara appointment be booked for?', intent: 'trade' },
  { q: 'Do therapists need a qualification to perform Shirodhara?', intent: 'trade' },
  { q: 'What can a spa say when advertising Shirodhara?', intent: 'trade' },
  { q: 'What does a hospital Panchakarma unit need for Shirodhara?', intent: 'trade' },
  { q: 'Who is allowed to perform Shirodhara in a hospital?', intent: 'trade' },
  { q: 'Is NABH accreditation required to offer Panchakarma?', intent: 'trade' },
  { q: 'What are the room requirements for a Panchakarma unit in India?', intent: 'trade' },
  { q: 'Is there a standard for reusing Shirodhara oil between patients?', intent: 'trade' },
  { q: 'Can a Shirodhara machine handle buttermilk and milk as well as oil?', intent: 'trade' },

  // -------------------------------------------------------------- brand
  { q: 'What is Age Ayurveda?', intent: 'brand' },
  { q: 'What is the Age Ayurveda Nighantu?', intent: 'brand' },
  { q: 'Who publishes the Nighantu?', intent: 'brand' },
  { q: 'What is Surya Shirodhara?', intent: 'brand' },

  // ------------------------------------------------------------ retired
  // Reference ground with no commercial edge that returned nothing across two runs.
  { q: 'Which classical texts describe Brahmi?', intent: 'reference', retired: '2026-09-18' },
  { q: 'What is Punarnava and which dosha does it pacify?', intent: 'reference', retired: '2026-09-18' },
  { q: 'What is Tagara used for in Ayurveda?', intent: 'reference', retired: '2026-09-18' },
  { q: 'What is Manjistha traditionally used for?', intent: 'reference', retired: '2026-09-18' },
  { q: 'What is the difference between Amla and Amalaki?', intent: 'reference', retired: '2026-09-18' },
  { q: 'Which herbs are lekhana in Ayurveda?', intent: 'reference', retired: '2026-09-18' },
  { q: 'What is Vacha and how is it used externally?', intent: 'reference', retired: '2026-09-18' },
  { q: 'What is a taila in Ayurvedic pharmacy?', intent: 'reference', retired: '2026-09-18' },
  { q: 'What is an arishta and how is it different from an asava?', intent: 'reference', retired: '2026-09-18' },
  { q: 'What is a guggulu preparation?', intent: 'reference', retired: '2026-09-18' },
  { q: 'What is a ghrita in Ayurveda?', intent: 'reference', retired: '2026-09-18' },
  // "Nighantu" is the ordinary Sanskrit word for a lexicon, so this prompt cannot
  // distinguish a citation of ours from any of the classical nighantus. It never could.
  { q: 'What is a nighantu in Ayurveda?', intent: 'brand', retired: '2026-09-18' },
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

const LOG = path.join('data', 'citation-log.csv');

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
    const model = process.env.GEO_AUDIT_MODEL || 'gpt-4o';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: question }],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    return { text: json.choices?.[0]?.message?.content ?? '', model, sources: [], urls: [] };
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Pace the free tier: roughly ten requests a minute, which is what it allows.
const PACE_MS = Number(process.env.GEO_AUDIT_PACE_MS ?? 6500);
const RETRY_BASE_MS = 20_000;

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

  if (error && !asks) console.log(`ERROR: ${error.slice(0, 70)}`);
  else if (hits) console.log(`✅ CITED ${hits}/${asks} -> ${[...urlsSeen].join(', ') || [...evidenceSeen].join(', ')}`);
  else if (mentionsSeen.size) console.log(`0/${asks}, mentioned only (${[...mentionsSeen].join(', ')})`);
  else console.log(`not cited 0/${asks}`);
}

fs.mkdirSync('data', { recursive: true });
const header = 'date,model,question,intent,cited,rate,hits,asks,matched,urls,error,sources';
const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const body = rows.map((r) => [r.date, r.model, r.question, r.intent, r.cited, r.rate, r.hits, r.asks, r.matched, r.urls, r.error, r.sources].map(esc).join(','));

/**
 * The columns have changed three times in a day. Appending rows of one shape under a header
 * of another produces a file that still parses and is quietly wrong, so rotate instead.
 */
if (fs.existsSync(LOG)) {
  const existing = fs.readFileSync(LOG, 'utf8').split('\n')[0].trim();
  if (existing !== header) {
    const firstDate = fs.readFileSync(LOG, 'utf8').split('\n')[1]?.slice(1, 11) ?? 'old';
    const archive = LOG.replace(/\.csv$/, `-${firstDate}.csv`);
    fs.renameSync(LOG, archive);
    console.log(`\nThe log's columns changed. Previous log archived as ${archive}.`);
  }
}
if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, `${header}\n`);
fs.appendFileSync(LOG, `${body.join('\n')}\n`);

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
