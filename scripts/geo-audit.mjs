#!/usr/bin/env node
/**
 * Citation panel. Runs a fixed set of prompts against an answer engine and
 * records whether Age Ayurveda or the Nighantu was cited, appending to
 * data/citation-log.csv.
 *
 * There is no analytics product that reports "you were cited", so the panel has
 * to be run deliberately and compared over time. Run it once before launch to
 * capture a genuine zero baseline, then monthly.
 *
 *   ANTHROPIC_API_KEY=... node scripts/geo-audit.mjs
 *   node scripts/geo-audit.mjs --list     # print the panel, run it by hand elsewhere
 */
import fs from 'node:fs';
import path from 'node:path';

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
];

const LOG = path.join('data', 'citation-log.csv');

if (process.argv.includes('--list')) {
  PANEL.forEach((q, i) => console.log(`${i + 1}. ${q}`));
  console.log(`\n${PANEL.length} prompts. Look for: ${NEEDLES.join(', ')}`);
  process.exit(0);
}

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('ANTHROPIC_API_KEY is not set.');
  console.error('Run `node scripts/geo-audit.mjs --list` to print the panel and run it by hand.');
  process.exit(1);
}

const MODEL = process.env.GEO_AUDIT_MODEL || 'claude-sonnet-5';
const rows = [];

for (const [i, question] of PANEL.entries()) {
  process.stdout.write(`[${i + 1}/${PANEL.length}] ${question.slice(0, 60)}... `);
  let text = '';
  let error = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
        messages: [{ role: 'user', content: question }],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    text = JSON.stringify(json.content ?? '');
  } catch (e) {
    error = String(e.message ?? e);
  }

  const hay = text.toLowerCase();
  const hits = NEEDLES.filter((n) => hay.includes(n));
  rows.push({
    date: new Date().toISOString().slice(0, 10),
    model: MODEL,
    question,
    cited: hits.length > 0 ? 'yes' : 'no',
    matched: hits.join('; '),
    error,
  });
  console.log(error ? `ERROR ${error}` : hits.length ? `CITED (${hits.join(', ')})` : 'not cited');
}

fs.mkdirSync('data', { recursive: true });
const header = 'date,model,question,cited,matched,error';
const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const body = rows.map((r) => [r.date, r.model, r.question, r.cited, r.matched, r.error].map(esc).join(','));
if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, `${header}\n`);
fs.appendFileSync(LOG, `${body.join('\n')}\n`);

const cited = rows.filter((r) => r.cited === 'yes').length;
const errors = rows.filter((r) => r.error).length;
console.log(`\ncited on ${cited}/${PANEL.length} prompts (${errors} errors). Appended to ${LOG}`);
