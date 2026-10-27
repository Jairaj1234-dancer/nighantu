/**
 * The practitioner directory: one record per practice location, read from src/data/practitioners.json.
 *
 * WHAT IS ADMITTED. A practice is listed only when four things are published for it by the practice
 * itself or by an official list: a named Ayurvedic practitioner, the practice's name, a full address
 * and a business telephone number. Each of the four carries the URL it was read from and the date it
 * was checked, and the page shows both. Nothing is taken from map or review platforms; their pages are
 * linked, never copied.
 *
 * WHAT A LISTING IS NOT. It is not an endorsement, a rating or a referral. The directory records who
 * practises where and how to reach them, so that a reader can check for themselves.
 */
import data from '../data/practitioners.json';

export interface Practitioner { name: string; qualification?: string | null; registration?: { number: string; source: string } | null }
export interface Practice {
  id: string;
  practiceName: string;
  practitioners: Practitioner[];
  address: { line: string; locality: string; city: string; pin: string };
  phone: string[];
  website?: string | null;
  email?: string | null;
  hours?: string | null;
  services?: string[];
  sources: Record<string, string>;
  testimonials?: { excerpt: string; attribution: string; url: string }[];
  reviewLinks?: { platform: string; url: string }[];
  checkedOn: string;
  geo?: { lat: number; lon: number } | null;
}

export const slug = (s: string) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const practices: Practice[] = ((data as any).practices ?? []) as Practice[];
export const updatedAt: string = (data as any).updatedAt ?? '';

export const cityOf = (p: Practice) => slug(p.address.city);
export const localityOf = (p: Practice) => slug(p.address.locality);
export const urlOf = (p: Practice) => `/practitioners/${cityOf(p)}/${localityOf(p)}/${p.id}/`;

/** Cities, each with its localities, every list sorted by name. */
export function cities() {
  const byCity = new Map<string, { slug: string; name: string; localities: Map<string, { slug: string; name: string; practices: Practice[] }> }>();
  for (const p of practices) {
    const c = cityOf(p);
    if (!byCity.has(c)) byCity.set(c, { slug: c, name: p.address.city, localities: new Map() });
    const city = byCity.get(c)!;
    const l = localityOf(p);
    if (!city.localities.has(l)) city.localities.set(l, { slug: l, name: p.address.locality, practices: [] });
    city.localities.get(l)!.practices.push(p);
  }
  return [...byCity.values()]
    .map((c) => ({
      ...c,
      localities: [...c.localities.values()]
        .map((l) => ({ ...l, practices: l.practices.sort((a, b) => a.practiceName.localeCompare(b.practiceName)) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const telHref = (t: string) => `tel:${t.replace(/[^\d+]/g, '')}`;

/** The state for structured data. A record may carry its own; otherwise it follows the city. */
const CITY_STATE: Record<string, string> = {
  mumbai: 'Maharashtra', thane: 'Maharashtra', 'navi-mumbai': 'Maharashtra', panvel: 'Maharashtra',
  kalyan: 'Maharashtra', dombivli: 'Maharashtra', 'mira-bhayandar': 'Maharashtra', pune: 'Maharashtra',
  delhi: 'Delhi', 'new-delhi': 'Delhi', gurugram: 'Haryana', noida: 'Uttar Pradesh', bengaluru: 'Karnataka',
  hyderabad: 'Telangana', chennai: 'Tamil Nadu', kolkata: 'West Bengal', ahmedabad: 'Gujarat',
  'pimpri-chinchwad': 'Maharashtra', 'greater-noida': 'Uttar Pradesh', ghaziabad: 'Uttar Pradesh',
  faridabad: 'Haryana', secunderabad: 'Telangana', gandhinagar: 'Gujarat', howrah: 'West Bengal',
  kochi: 'Kerala', aluva: 'Kerala', tripunithura: 'Kerala', thiruvananthapuram: 'Kerala', thrissur: 'Kerala', nattika: 'Kerala',
  kozhikode: 'Kerala', mukkam: 'Kerala', jaipur: 'Rajasthan', 'rampura-dabri': 'Rajasthan',
  assagao: 'Goa', mandrem: 'Goa', panaji: 'Goa', mapusa: 'Goa', dhargal: 'Goa', valpoi: 'Goa', shiroda: 'Goa', colva: 'Goa', margao: 'Goa', ponda: 'Goa', varca: 'Goa', benaulim: 'Goa', chicalim: 'Goa', curchorem: 'Goa', balli: 'Goa', chinchinim: 'Goa', curtorim: 'Goa', dharbandora: 'Goa',
  rishikesh: 'Uttarakhand', haridwar: 'Uttarakhand', dehradun: 'Uttarakhand', doiwala: 'Uttarakhand', selaqui: 'Uttarakhand', manduwala: 'Uttarakhand', kunaw: 'Uttarakhand', guruvayur: 'Kerala', irinjalakuda: 'Kerala', chalakudy: 'Kerala', kodungallur: 'Kerala',
  kunnamkulam: 'Kerala', neyyattinkara: 'Kerala', feroke: 'Kerala', koyilandy: 'Kerala',
};
export const stateOf = (p: Practice) => (p.address as any).state ?? CITY_STATE[cityOf(p)] ?? '';
