import { get } from '../lib/fetch.mjs';
import { extractProduct, isPackSize } from '../lib/product-extract.mjs';
import { fetchRobots, groupFor, isAllowed } from '../lib/robots.mjs';
import { DISCLOSURE_WATCH, DISCLOSURE_AGENT } from './config.mjs';

export const id = 'disclosure';
export const label = 'Composition disclosure';

/**
 * Keep /choosing/who-publishes-the-composition/ honest.
 *
 * That page states, for seven named companies, whether their own product pages published an
 * ingredient list and quantities on the date they were read. It offers to correct errors,
 * including where the correction favours a competitor. A promise like that decays on its own: the
 * pages change, our figures do not, and after a few months the page is confidently wrong about
 * somebody else's business.
 *
 * So this watches one representative page per company and reports when the disclosure state flips.
 * It does not re-run the survey, which is 210 fetches and belongs in a scheduled job; it answers
 * the narrower question of whether the survey has gone stale, which is the thing that would make
 * the page unfair.
 *
 * WHY THE EXPECTED STATE IS IN THE CONFIG rather than read back from the live page. A diff against
 * last run tells you something moved. A diff against what the page CLAIMS tells you the page is
 * wrong, which is the finding worth waking someone for, and it still fires on the first run after
 * a change rather than needing two.
 *
 * ROBOTS ARE RE-CHECKED EVERY TIME. Permission at survey time is not permission now, and a company
 * that has since decided to decline crawlers must be obeyed on the next pass, not on the next
 * survey. A host that now declines is reported as a finding and not fetched, because that change is
 * itself something the page should say.
 */

/**
 * The SAME reading the survey made, not a second opinion.
 *
 * This started with its own regex over the visible text and disagreed with the collector on four
 * of the seven pages, which would have made it a false-alarm machine defending a page it
 * contradicted. Shree Dhootapapeshwar was the clearest case: its composition lives in a JSON
 * field rather than in visible text, so a text scan reads the page as carrying nothing, which is
 * exactly the `absent`-versus-`unreadable` conflation the survey is careful not to make.
 *
 * scripts/lib/product-extract.mjs is where that care lives: the navigation-line blacklist, the
 * function-word test that stops marketing prose validating as a list, the commerce-line
 * terminator, the basis and dose and pack-size filters on the quantity figures. A monitor
 * guarding a claim has to apply the rule the claim was made under.
 */
function stateOf(html) {
  const x = extractProduct(html);
  if (x.composition.state === 'unreadable') return 'unreadable';
  if (x.composition.state !== 'found') return 'neither';
  const qty = (x.quantities ?? []).filter((q) => !isPackSize(q));
  return qty.length ? 'quantities' : 'list';
}

const WORDS = {
  quantities: 'an ingredient list with quantities',
  list: 'an ingredient list without quantities',
  neither: 'no ingredient list',
  unreadable: 'almost no readable text, which means it now renders in the browser',
};

export async function run(state) {
  const findings = [];
  const summary = [];
  state.disclosure ??= {};

  for (const w of DISCLOSURE_WATCH) {
    const url = new URL(w.url);

    // 1. Permission, every time, before anything is fetched from the host.
    let permitted = true;
    try {
      const robots = await fetchRobots(url.origin, DISCLOSURE_AGENT);
      if (robots && robots.status === 200 && robots.text) {
        const group = groupFor(robots.groups, DISCLOSURE_AGENT);
        permitted = isAllowed(group, url.pathname);
      }
    } catch {
      // A robots.txt we cannot read is not a licence to proceed on a host we are only
      // double-checking. Skip it and say so, rather than fetch on an assumption.
      permitted = false;
      summary.push({ id: w.id, status: 'robots-unreadable' });
      continue;
    }

    if (!permitted) {
      summary.push({ id: w.id, status: 'declined' });
      findings.push({
        fingerprint: `disclosure:declined:${w.id}`,
        severity: 'medium',
        title: `${w.company} now declines this crawler`,
        body: [
          `\`${w.url}\` is no longer permitted to this crawler by \`${url.origin}/robots.txt\`.`,
          '',
          `${w.company} is named in the tables on \`/choosing/who-publishes-the-composition/\`,`,
          'which state what their pages published when they were last read. Nothing was fetched.',
          '',
          'That page already treats a declined catalogue as a finding rather than a gap, so the',
          'honest move is to move this company into that list and say when it changed.',
        ].join('\n'),
      });
      continue;
    }

    // 2. Read it.
    const res = await get(w.url, { retries: 1 });
    if (!res.ok) {
      summary.push({ id: w.id, status: res.status });
      if (res.status === 404 || res.status === 410) {
        findings.push({
          fingerprint: `disclosure:gone:${w.id}:${res.status}`,
          severity: 'medium',
          title: `Watched product page gone: ${w.company} (${res.status})`,
          body: [
            `\`${w.url}\` returned **${res.status}**.`,
            '',
            'It is the page the composition-disclosure comparison cites for this company. A count',
            'attributed to a page nobody can open cannot be checked by the company it names, which',
            'is the one thing that page promises. Pick a current page for it or re-run the survey.',
          ].join('\n'),
        });
      }
      continue;
    }

    const now = stateOf(res.text);
    summary.push({ id: w.id, status: res.status, state: now });

    if (now !== w.expect) {
      findings.push({
        fingerprint: `disclosure:changed:${w.id}:${now}`,
        severity: 'medium',
        title: `${w.company} disclosure changed: the page now shows ${WORDS[now]}`,
        body: [
          `\`${w.url}\``,
          '',
          `Recorded as showing **${WORDS[w.expect]}**; it now shows **${WORDS[now]}**.`,
          '',
          '`/choosing/who-publishes-the-composition/` states the recorded figure and offers to',
          'correct it, including where the correction favours a competitor. This is that case.',
          '',
          'Re-run `node scripts/brand-catalogue.mjs`, then `node scripts/brand-disclosure.mjs`,',
          'and commit the regenerated tables. Update `expect` in `scripts/monitors/config.mjs`',
          'in the same change, or this fires every run.',
        ].join('\n'),
      });
    }

    state.disclosure[w.id] = { state: now, checkedOn: new Date().toISOString().slice(0, 10) };
  }

  return {
    findings,
    metrics: {
      watched: DISCLOSURE_WATCH.length,
      read: summary.filter((s) => s.state).length,
      changed: findings.length,
    },
  };
}
