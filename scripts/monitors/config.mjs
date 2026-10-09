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
 * The fifteen companies named in the composition-disclosure comparison.
 *
 * That page states what each company's own product pages published on the date they were read,
 * and offers to correct an error including where the correction favours a competitor. Those pages
 * change and our figures do not, so the promise rots unless something watches. One representative
 * page per company is enough to tell us the survey has gone stale; re-reading all 5,995 is a
 * scheduled job, not a monitor.
 *
 * This list covered SEVEN companies while the page named fifteen, which is worse than not watching
 * at all: it looks like the promise is kept and keeps it for under half of them. Widening the
 * survey and not widening the watch was one change, and I made only half of it.
 *
 * THE WATCHED PAGE IS ONE IN THE COMPANY'S MODAL STATE, meaning whatever it does on most of its
 * pages. That is the thing that would change if the company changed how it publishes, and it makes
 * the probe informative in both directions: Shree Dhootapapeshwar is watched on a page carrying
 * quantities, so we hear if it stops, and Patanjali on one carrying nothing, so we hear if it
 * starts. A formulary-name product is preferred where the company sells one. Five of these
 * companies sell none, so their watched page is necessarily a proprietary product; that is a
 * limitation of the probe and not of the company.
 *
 * `expect` is the state the page claims, not the state we saw last run, so a change is reported as
 * "the page is now wrong" on the first pass rather than needing two.
 *
 * Age Ayurveda is in this list on the same terms as everyone else. We are the company the
 * comparison records as publishing nothing against a formulary name, so a monitor that skipped us
 * would be measuring only other people's drift.
 */
export const DISCLOSURE_AGENT = 'NighantuBot';

export const DISCLOSURE_WATCH = [
  { id: 'sna', company: 'SNA Oushadhasala', url: 'https://www.snaoushadhasala.com/product/pindatailam-cream-kN7vak', expect: 'neither' },
  { id: 'patanjali', company: 'Patanjali Ayurved', url: 'https://www.patanjaliayurved.net/product/ayurvedic-medicine/arishta/divya-kutajarista/85', expect: 'neither' },
  { id: 'himalaya', company: 'Himalaya Wellness', url: 'https://himalayawellness.in/products/complete-care-toothpaste', expect: 'list' },
  { id: 'avp', company: 'The Arya Vaidya Pharmacy, Coimbatore', url: 'https://avpayurveda.com/products/dhanwantharam-thailam-balm-to-relieve-joint-and-muscle-pain', expect: 'neither' },
  { id: 'sitaram', company: 'Sitaram Ayurveda', url: 'https://sitaramayurveda.com/products/abhayarishtam', expect: 'neither' },
  { id: 'avn', company: 'AVN Ayurveda', url: 'https://www.avnayurveda.com/product/chyavanaprasam/', expect: 'neither' },
  { id: 'sdl', company: 'Shree Dhootapapeshwar', url: 'https://www.sdlindia.com/products/chyavanprash-ashtavarga', expect: 'quantities' },
  { id: 'maharishi', company: 'Maharishi Ayurveda', url: 'https://maharishiayurvedaindia.com/products/abhyarishta-for-treatment-of-constipation-450ml', expect: 'neither' },
  { id: 'keralaayurveda', company: 'Kerala Ayurveda', url: 'https://keralaayurveda.com/products/abhayarishta', expect: 'list' },
  { id: 'baidyanath', company: 'Baidyanath', url: 'https://www.baidyanathayurved.com/products/baidyanath-kanchnar-guggulu-160-tablets', expect: 'neither' },
  { id: 'zandu', company: 'Zandu', url: 'https://zanducare.com/products/zandu-chyavanprash-avaleha-900g-pack-of-2', expect: 'list' },
  { id: 'charak', company: 'Charak Pharma', url: 'https://charak.com/products/extrammune-syrup', expect: 'neither' },
  { id: 'sandu', company: 'Sandu Pharmaceuticals', url: 'https://sandu.in/product/msk-plus-450ml-amritarishtha-450ml/', expect: 'neither' },
  { id: 'dabur', company: 'Dabur', url: 'https://www.dabur.com/our-brand/dabur-ashokarishta', expect: 'list' },
  { id: 'ageayurveda', company: 'Age Ayurveda', url: 'https://ageayurveda.com/products/chyawanprash', expect: 'neither' },
  // Added with wave 3. Oushadhi is the Government of Kerala manufacturer and the third most
  // forthcoming company in the survey, so its modal page is one that carries quantities.
  { id: 'oushadhi', company: 'Oushadhi', url: 'https://www.oushadhi.org/product/abhayarishtam', expect: 'quantities' },
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
