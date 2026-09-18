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

const PANEL = [
  // Practice questions, where the Shirodhara hub should win
  'What is Shirodhara and where does it come from?',
  'What temperature should Shirodhara oil be?',
  'How long does a Shirodhara session last?',
  'Which oil is used for Vata Shirodhara?',
  'Which oil should be used for a Pitta constitution in Shirodhara?',
  'Can you do Shirodhara at home without an assistant?',
  'Who should not have Shirodhara?',
  'What is the difference between Shirodhara and shiro abhyanga?',
  'What is takra dhara?',
  'How much oil does a Shirodhara session use?',
  'What equipment do you need for Shirodhara?',
  'Is a Shirodhara machine a medical device?',
  'What is murdha taila?',
  'Which classical text describes Shirodhara?',
  'How often should you have Shirodhara?',
  // Herb questions, where the monographs should win
  'What is the Ayurvedic category of Ashwagandha?',
  'What is the botanical name of Yashtimadhu and what is it used for traditionally?',
  'What are the main withanolides in Withania somnifera?',
  'What is the dosha effect of Haridra?',
  'What is Guduchi used for in classical Ayurveda?',
  'What is the rasa, virya and vipaka of Shatavari?',
  'Which classical texts describe Brahmi?',
  'What is Bhringraj traditionally used for?',
  'What is the pharmacopoeial status of Ashwagandha in Europe?',
  'What is Punarnava and which dosha does it pacify?',
  'What is Tagara used for in Ayurveda?',
  'What is Manjistha traditionally used for?',
  'What is the difference between Amla and Amalaki?',
  'Which herbs are lekhana in Ayurveda?',
  'What is Vacha and how is it used externally?',
  // Formulation questions
  'What is an avaleha in Ayurveda?',
  'What is the difference between a churna and a vati?',
  'What is Ajamodadi Churna and what is the standard dose?',
  'What is a taila in Ayurvedic pharmacy?',
  'What is an arishta and how is it different from an asava?',
  'What is Triphala and what is it traditionally used for?',
  'What is a guggulu preparation?',
  'What is a ghrita in Ayurveda?',
  // Instrument questions
  'What is a dhara patra?',
  'What is the traditional material for a Shirodhara pot?',
  'What is a neti pot used for in Ayurveda?',
  'What Ayurvedic instruments are described in the Sushruta Samhita?',
  'What is shiro basti?',
  // Category and buying questions
  'Where can I buy a portable Shirodhara machine?',
  'What should I look for in a Shirodhara oil?',
  'Is there a Shirodhara device that works without plumbing?',
  'What does a home Shirodhara setup cost to run?',
  'Which Ayurvedic brands publish their sourcing?',
  // Brand and entity questions
  'What is Age Ayurveda?',
  'What is a nighantu in Ayurveda?',
  'What is the Age Ayurveda Nighantu?',
  'Who publishes the Nighantu?',
  'What is Surya Shirodhara?',
  'Which companies make portable Shirodhara equipment?',
];

const NEEDLES = [
  'ageayurveda.com', 'age ayurveda', 'nighantu',
  // The github.io host stays: a citation earned before the move is still a citation,
  // and anything that cached the old URL will keep quoting it for months.
  'jairaj1234-dancer.github.io/nighantu', 'nighantu.ageayurveda.com',
  'surya shirodhara',
];

const LOG = path.join('data', 'citation-log.csv');

if (process.argv.includes('--list')) {
  console.log(`\n=== GEO AUDIT PANEL (${PANEL.length} Prompts) ===`);
  PANEL.forEach((q, i) => console.log(`${String(i + 1).padStart(2, ' ')}. ${q}`));
  console.log(`\nLooking for citations: ${NEEDLES.join(', ')}`);
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
let prompts = PANEL;
const sampleIdx = process.argv.indexOf('--sample');
if (sampleIdx !== -1 && process.argv[sampleIdx + 1]) {
  const n = parseInt(process.argv[sampleIdx + 1], 10);
  if (!isNaN(n)) prompts = PANEL.slice(0, n);
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
    return { text: JSON.stringify(json.content ?? ''), model };
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
    return { text: `${content} ${citations}`, model };
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
    return { text: json.choices?.[0]?.message?.content ?? '', model };
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
        const grounding = JSON.stringify(json.candidates?.[0]?.groundingMetadata ?? {});
        return { text: `${parts.map((p) => p.text).join(' ')} ${grounding}`, model };
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Pace the free tier: roughly ten requests a minute, which is what it allows.
const PACE_MS = Number(process.env.GEO_AUDIT_PACE_MS ?? 6500);
const RETRY_BASE_MS = 20_000;

for (const [i, question] of prompts.entries()) {
  if (i > 0 && provider === 'gemini') await sleep(PACE_MS);
  process.stdout.write(`[${i + 1}/${prompts.length}] ${question.slice(0, 50)}... `);
  let text = '';
  let modelName = provider;
  let error = '';

  try {
    const result = await queryModel(question);
    text = result.text;
    modelName = result.model;
  } catch (e) {
    error = String(e.message ?? e);
    // A spent daily allowance will refuse every remaining prompt too. Recording 50 more
    // "not cited" rows for questions that were never asked would read as a genuine zero
    // when someone looks at this log in three months.
    if (e.fatal) {
      console.log('\n\nStopping: the daily allowance is spent. Nothing further was asked, and');
      console.log('no row is recorded for the unasked prompts. Re-run after the quota resets.');
      break;
    }
  }

  const hay = text.toLowerCase();
  const hits = NEEDLES.filter((n) => hay.includes(n));
  const isCited = hits.length > 0;

  rows.push({
    date: new Date().toISOString().slice(0, 10),
    model: `${provider}:${modelName}`,
    question,
    cited: isCited ? 'yes' : 'no',
    matched: hits.join('; '),
    error,
  });

  if (error) console.log(`ERROR: ${error.slice(0, 80)}`);
  else if (isCited) console.log(`✅ CITED (${hits.join(', ')})`);
  else console.log('not cited');
}

fs.mkdirSync('data', { recursive: true });
const header = 'date,model,question,cited,matched,error';
const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const body = rows.map((r) => [r.date, r.model, r.question, r.cited, r.matched, r.error].map(esc).join(','));

if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, `${header}\n`);
fs.appendFileSync(LOG, `${body.join('\n')}\n`);

const citedCount = rows.filter((r) => r.cited === 'yes').length;
const errorCount = rows.filter((r) => r.error).length;

console.log(`\nResults: cited on ${citedCount}/${prompts.length} prompts (${errorCount} errors). Appended to ${LOG}`);
