#!/usr/bin/env node
/**
 * Negative tests for the robots.txt parser.
 *
 * This is the only code here that decides whether to fetch someone else's page, so it is tested
 * the way the safety schema is tested: on the cases where a careless parser says yes and the file
 * said no. Each case below is a real shape found on the sites this is pointed at.
 */
import assert from 'node:assert/strict';
import { parseRobots, groupFor, isAllowed } from '../lib/robots.mjs';

const allows = (txt, ua, p) => isAllowed(groupFor(parseRobots(txt), ua), p);
let n = 0;
const check = (label, actual, expected) => { assert.equal(actual, expected, label); n += 1; };

// A blanket Disallow means no, and the fallback group is what an unnamed agent gets.
check('blanket disallow', allows('User-agent: *\nDisallow: /', 'nighantu-bot', '/products/x'), false);
check('empty disallow allows', allows('User-agent: *\nDisallow:', 'nighantu-bot', '/anything'), true);
check('no robots rules', allows('', 'nighantu-bot', '/x'), true);

// Longest match wins, so a narrow Allow reopens part of a blanket Disallow. Reading in order
// would answer false here, which is the single most common parser bug.
const reopened = 'User-agent: *\nDisallow: /\nAllow: /products/\n';
check('narrow allow reopens', allows(reopened, 'anybot', '/products/triphala'), true);
check('blanket still applies elsewhere', allows(reopened, 'anybot', '/about/'), false);

// A named group is the WHOLE answer: it never inherits the * group's permissions.
const named = 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n';
check('named group governs', allows(named, 'GPTBot/1.0', '/products/x'), false);
check('others keep the fallback', allows(named, 'Googlebot', '/products/x'), true);
check('agent match is case-insensitive', allows(named, 'gptbot', '/x'), false);

// Consecutive User-agent lines are ONE group. A parser that opens a new group per line keeps
// only the last agent's rules and happily fetches what the other two were refused.
const stacked = 'User-agent: GPTBot\nUser-agent: ClaudeBot\nUser-agent: CCBot\nDisallow: /\n';
check('stacked agents, first', allows(stacked, 'GPTBot', '/x'), false);
check('stacked agents, middle', allows(stacked, 'ClaudeBot/1.0', '/x'), false);
check('stacked agents, last', allows(stacked, 'CCBot', '/x'), false);
check('stacked agents, unnamed is unaffected', allows(stacked, 'nighantu-bot', '/x'), true);

// Wildcard and end-anchor extensions, which sites write expecting them to be honoured.
check('wildcard in the middle', allows('User-agent: *\nDisallow: /*/cart\n', 'b', '/shop/cart'), false);
check('end anchor matches exactly', allows('User-agent: *\nDisallow: /*.pdf$\n', 'b', '/a/b.pdf'), false);
check('end anchor does not over-match', allows('User-agent: *\nDisallow: /*.pdf$\n', 'b', '/a/b.pdf.html'), true);

// Comments, blank lines and odd casing must not change the verdict.
check('comments stripped', allows('# hello\nUser-Agent: *   # all\nDISALLOW: /x   # no\n', 'b', '/x'), false);
check('percent-encoding compares equal', allows('User-agent: *\nDisallow: /über\n', 'b', '/%C3%BCber'), false);

// A longest-tie goes to Allow, which is what the RFC specifies and what sites rely on.
check('tie goes to allow', allows('User-agent: *\nDisallow: /p\nAllow: /p\n', 'b', '/p/x'), true);

// A rule with no group above it belongs to nobody and must not become a universal rule.
check('orphan rule is ignored', allows('Disallow: /\n', 'b', '/x'), true);

// Crawl-delay and Sitemap lines are neither Allow nor Disallow and must not end the agent block.
const withExtras = 'User-agent: *\nCrawl-delay: 10\nSitemap: https://x/s.xml\nDisallow: /secret\n';
check('unknown fields do not break the group', allows(withExtras, 'b', '/secret/a'), false);
check('unknown fields leave the rest open', allows(withExtras, 'b', '/open'), true);

// An unknown verdict must be read as closed by the caller, so the option exists and works.
check('defaultAllow false closes an empty group', isAllowed(null, '/x', { defaultAllow: false }), false);

console.log(`PASS: ${n} robots.txt cases`);
