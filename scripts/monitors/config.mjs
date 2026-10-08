/** What the monitors watch. Edit here, not in the monitor modules. */

export const SITE = (process.env.ATLAS_SITE || 'https://nighantu.ageayurveda.com').replace(/\/$/, '');
// Empty by default since the move to nighantu.ageayurveda.com: the site is its own
// origin and its pages sit at the root. The old default silently prefixed /nighantu to
// every health check, so a dry run reported the whole site as 404 while it was fine.
export const BASE = (process.env.ATLAS_BASE ?? '').replace(/\/$/, '');
export const ORIGIN = new URL(SITE).origin;

/** Paths that must return 200 for the site to be functioning at all. */
export const HEALTH_PATHS = [
  '/',
  '/robots.txt',
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap-index.xml',
  '/rss.xml',
  '/herb/ashwagandha/',
  '/herb/ashwagandha.md',
  '/shirodhara/',
  '/shirodhara/choosing-equipment/',
  '/glossary/',
  '/about/',
];

/**
 * Files that must exist at the ORIGIN root, not under the base path. Crawlers read
 * robots.txt only from the origin, and the IndexNow key must be reachable or every
 * submission is rejected. Both are served by a separate repo while the site lives on
 * a project path, which makes them easy to break without noticing.
 */
export const ROOT_PATHS = ['/robots.txt', '/llms.txt', '/bf9a6ad9a651b9775c941d4fd074a13a.txt'];

/**
 * The five devices in the comparison table. That page states a "checked on" date and
 * promises to correct errors, including where a correction favours a competitor.
 * This is what keeps that promise honest.
 */
export const COMPETITORS = [
  { id: 'cristalmind', name: 'Cristalmind', url: 'https://www.cristalmind.com/' },
  { id: 'ajengineer', name: 'AJ Engineer', url: 'https://www.ajengineer.co.in/ayurvedic-therapy-machine.html' },
  { id: 'esteem', name: 'Esteem Services', url: 'https://www.esteemservices.in/fully-automatic-shirodhara-machine.htm' },
  {
    id: 'kawachi',
    name: 'Kawachi',
    url: 'https://kawachigroup.com/products/portable-shirodhara-machine-for-home-ayurvedic-oil-drip-therapy-device-integrated-music-aromatherapy-adjustable-temperature-control-stress-relief-deep-relaxation-system',
  },
  { id: 'ananda', name: 'Ananda', url: 'https://www.anandashirodhara.com/product-page/ananda-automatic-shirodhara-equipment' },
];

/**
 * The seven companies named in the composition-disclosure comparison.
 *
 * That page states what each company's own product pages published on the date they were read,
 * and offers to correct an error including where the correction favours a competitor. Those
 * pages change and our figures do not, so the promise rots unless something watches. One
 * representative page per company, with the state we recorded against it, is enough to tell us
 * the survey has gone stale; re-running all 210 fetches is a scheduled job, not a monitor.
 *
 * `expect` is the state the page claims, not the state we saw last run, so a change is reported
 * as "the page is now wrong" on the first pass rather than needing two. Each URL is one that was
 * itself in that state, not merely one of several pages aggregated into it.
 *
 * Age Ayurveda is in this list on the same terms as everyone else. We are the company the
 * comparison records as publishing nothing, so a monitor that skipped us would be measuring only
 * other people's drift.
 */
export const DISCLOSURE_AGENT = 'NighantuBot';

export const DISCLOSURE_WATCH = [
  { id: 'patanjali', company: 'Patanjali Ayurved', url: 'https://www.patanjaliayurved.net/product/combo-offers/combos/combo-special-chyawanprash-1-kg-pack-of-2/7067', expect: 'quantities' },
  { id: 'sdl', company: 'Shree Dhootapapeshwar', url: 'https://www.sdlindia.com/products/chyavanprash-ashtavarga', expect: 'quantities' },
  { id: 'dabur', company: 'Dabur', url: 'https://www.dabur.com/our-brand/dabur-chyawanprash', expect: 'list' },
  { id: 'zandu', company: 'Zandu', url: 'https://zanducare.com/products/zandu-chyavanprash-avaleha-900g-pack-of-2', expect: 'list' },
  { id: 'baidyanath', company: 'Baidyanath', url: 'https://www.baidyanathayurved.com/products/baidyanath-chyawanprash-jaggery-750gm', expect: 'neither' },
  { id: 'maharishi', company: 'Maharishi Ayurveda', url: 'https://maharishiayurvedaindia.com/products/abhyarishta-for-treatment-of-constipation-450ml', expect: 'neither' },
  { id: 'ageayurveda', company: 'Age Ayurveda', url: 'https://ageayurveda.com/products/chyawanprash', expect: 'neither' },
];

/** Numbers and spec words worth noticing a change in. */
export const COMPETITOR_SIGNALS = [
  /(?:₹|rs\.?|inr)\s?[\d,]{3,}/gi,
  /(?:chf|usd|eur|\$|€)\s?[\d,]+(?:\.\d{2})?/gi,
  /\d+(?:\.\d+)?\s?(?:kg|kgs|grams?|g)\b/gi,
  /\d+(?:\.\d+)?\s?(?:°\s?c|degrees? c)/gi,
  /\b\d+\s?(?:to|-|–)\s?\d+\s?(?:minutes?|min)\b/gi,
  /\b\d+\s?(?:year|yr)s?\s+(?:warranty|guarantee)/gi,
  /\b\d+\s?(?:litre|liter|l|ml)\b/gi,
];

/**
 * Public RSS only. Nothing here authenticates to, or posts on, any community
 * platform. Reddit's Data API terms bar commercial use without a negotiated licence,
 * and a domain-level ban would poison every future mention of the site, including
 * genuine third-party ones. Reading a public feed and filing an issue in our own repo
 * is not that; posting would be.
 */
export const FEEDS = [
  { id: 'r-ayurveda', label: 'r/Ayurveda', url: 'https://www.reddit.com/r/Ayurveda/new/.rss' },
  { id: 'r-herbalism', label: 'r/herbalism', url: 'https://www.reddit.com/r/herbalism/new/.rss' },
  { id: 'r-sanskrit', label: 'r/Sanskrit', url: 'https://www.reddit.com/r/sanskrit/new/.rss' },
  { id: 'r-herbalmedicine', label: 'r/HerbalMedicine', url: 'https://www.reddit.com/r/HerbalMedicine/new/.rss' },
  // Add Google Alerts RSS URLs here once created. They are per-account and cannot be
  // generated programmatically.
];

/** A feed item is only worth surfacing if it matches something we can actually answer. */
export const FEED_KEYWORDS = [
  'shirodhara', 'panchakarma', 'ashtanga hridaya', 'charaka', 'sushruta',
  'bhavaprakasha', 'nighantu', 'dravyaguna', 'rasayana', 'chyawanprash',
  'ashwagandha', 'shatavari', 'triphala', 'guduchi', 'brahmi', 'yashtimadhu',
  'taila', 'abhyanga', 'dosha', 'vata', 'pitta', 'kapha', 'ayurvedic oil',
];

/**
 * Site-wide Reddit search terms. Search beats per-subreddit /new because the question
 * is usually asked somewhere other than the obvious subreddit. Kept deliberately short:
 * Reddit returns HTTP 429 within seconds of a burst, so this runs once a day with a
 * six-second gap between requests.
 */
export const FEED_QUERIES = [
  'shirodhara',
  'panchakarma',
  'ashwagandha dosage',
  'triphala',
  'ayurvedic oil',
  'abhyanga',
  'chyawanprash',
  'brahmi OR bacopa',
  'shatavari',
  'ayurveda herb',
];

/** A few subreddit firehoses, for questions the search terms miss. */
export const FEED_SUBS = ['Ayurveda', 'herbalism', 'HerbalMedicine'];

/** How many threads to surface per day, at most. */
export const THREAD_TARGET = 10;

/** Pages older than this are flagged for review. */
export const FRESHNESS_DAYS = 180;

/** How long a resolved finding stays suppressed before it can alert again. */
export const SEEN_EXPIRY_DAYS = 30;
