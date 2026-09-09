/** What the monitors watch. Edit here, not in the monitor modules. */

export const SITE = (process.env.ATLAS_SITE || 'https://jairaj1234-dancer.github.io').replace(/\/$/, '');
export const BASE = (process.env.ATLAS_BASE ?? '/nighantu').replace(/\/$/, '');
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

/** Pages older than this are flagged for review. */
export const FRESHNESS_DAYS = 180;

/** How long a resolved finding stays suppressed before it can alert again. */
export const SEEN_EXPIRY_DAYS = 30;
