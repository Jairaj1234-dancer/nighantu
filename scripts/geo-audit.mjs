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
  'jairaj1234-dancer.github.io/nighantu', 'surya shirodhara',
  'nighantu.ageayurveda.com', 'shree baidyanath'
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

let provider = null;
if (anthropicKey) provider = 'anthropic';
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
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }] }],
        tools: [{ googleSearch: {} }],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const grounding = JSON.stringify(json.candidates?.[0]?.groundingMetadata ?? {});
    return { text: `${parts.map((p) => p.text).join(' ')} ${grounding}`, model };
  }

  throw new Error(`Unknown provider ${provider}`);
}

const rows = [];

for (const [i, question] of prompts.entries()) {
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
