/**
 * Links between monographs, procedures, instruments and reference lists, from fields the pages
 * already carry. Built because most reference, procedure and instrument pages were reachable only
 * from their section index: a median of one internal link each, against eleven for a herb.
 *
 *   lists       The compound and botanical-family reference lists that link to this monograph.
 *               The list names the page itself, so the reverse link asserts nothing new. The
 *               pharmacology and body-system lists are left out on purpose: a link to "Antidiabetic
 *               agents" on every herb page it names would put a disease label on hundreds of pages.
 *   procedures  Procedures whose named substances resolve to this monograph.
 *   siblings    Other procedures at the same level of supervision, or other instruments in the
 *               same category, which is how the section indexes already group them.
 *
 * A procedure's substance links only when its name, diacritics folded, matches the title, slug or
 * Sanskrit name of exactly one herb or formulation. A near match gets no link: a wrong link costs
 * more than a missing one. The page and its Markdown twin both read from here.
 *
 * No link whose title carries a DMR Act scheduled term (src/lib/scheduled.ts) is placed by this
 * module. Many of these pages carry a product module, and a linked title such as Kutipraveshika
 * Vajikarana would put the scheduled term beside it, which is what the audit forbids.
 */
import { getCollection } from 'astro:content';
import { termsIn } from './scheduled';

export type Ref = { href: string; title: string };
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const LIST_CATEGORIES = new Set(['Compounds', 'Families']);
const LEVEL_LABEL: Record<string, string> = {
  'self-care': 'practices you can do yourself',
  supervised: 'procedures given by a trained therapist',
  'vaidya-only': 'procedures requiring a qualified vaidya',
};

let built: Promise<ReturnType<typeof build> extends Promise<infer T> ? T : never> | null = null;

async function build() {
  const [herbs, formulations, practices, references, devices] = await Promise.all(
    ['herb', 'formulation', 'practice', 'reference', 'device'].map((c) => getCollection(c as any)),
  ) as any[][];

  const byName = new Map<string, Set<string>>();
  const titleOf = new Map<string, string>();
  for (const e of [...herbs, ...formulations]) {
    const key = `${e.collection}/${e.data.slug}`;
    titleOf.set(key, e.data.title);
    for (const n of [e.data.title, e.data.slug, e.data.sanskrit].filter(Boolean)) {
      const f = fold(n);
      if (!f) continue;
      if (!byName.has(f)) byName.set(f, new Set());
      byName.get(f)!.add(key);
    }
  }
  const resolve = (name: string): string | null => {
    const hits = byName.get(fold(name));
    return hits && hits.size === 1 ? [...hits][0] : null;
  };

  const lists = new Map<string, Ref[]>();
  for (const r of references) {
    if (!LIST_CATEGORIES.has(r.data.category)) continue;
    const seen = new Set<string>();
    for (const m of String(r.body ?? '').matchAll(/\]\(\/(herb|formulation)\/([^/)\s]+)\/\)/g)) {
      const key = `${m[1]}/${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key)!.push({ href: `/reference/${r.data.slug}/`, title: r.data.title });
    }
  }

  const procedures = new Map<string, Ref[]>();
  const substances = new Map<string, (Ref | string)[]>();
  for (const p of practices) {
    const named = (p.data.dravyas ?? []).map((x: string) => {
      const key = resolve(x);
      if (!key) return x;
      if (!procedures.has(key)) procedures.set(key, []);
      if (!procedures.get(key)!.some((r) => r.href === `/practice/${p.data.slug}/`)) {
        procedures.get(key)!.push({ href: `/practice/${p.data.slug}/`, title: p.data.title });
      }
      return { href: `/${key}/`, title: x };
    });
    substances.set(p.data.slug, named);
  }

  const group = (items: any[], field: string, kind: string) => {
    const out = new Map<string, Ref[]>();
    for (const e of items) {
      const g = e.data[field];
      if (!g) continue;
      if (!out.has(g)) out.set(g, []);
      out.get(g)!.push({ href: `/${kind}/${e.data.slug}/`, title: e.data.title });
    }
    for (const v of out.values()) v.sort((a, b) => a.title.localeCompare(b.title));
    return out;
  };
  const practiceGroups = group(practices, 'level', 'practice');
  const deviceGroups = group(devices, 'ayurvedicCategory', 'device');

  const clean = (v: Ref[]) => v.filter((x) => termsIn(x.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()).length === 0);
  const sort = (v: Ref[]) => clean([...v].sort((a, b) => a.title.localeCompare(b.title)));
  return {
    lists: (key: string) => sort(lists.get(key) ?? []),
    procedures: (key: string) => sort(procedures.get(key) ?? []),
    substances: (slug: string) => substances.get(slug) ?? [],
    siblings: (kind: string, data: any): { label: string; items: Ref[] } | null => {
      const self = `/${kind}/${data.slug}/`;
      if (kind === 'practice' && data.level && LEVEL_LABEL[data.level]) {
        const items = clean((practiceGroups.get(data.level) ?? []).filter((r) => r.href !== self));
        return items.length ? { label: `Other ${LEVEL_LABEL[data.level]}`, items } : null;
      }
      if (kind === 'device' && data.ayurvedicCategory) {
        const items = clean((deviceGroups.get(data.ayurvedicCategory) ?? []).filter((r) => r.href !== self));
        return items.length ? { label: `Other instruments filed under ${data.ayurvedicCategory}`, items } : null;
      }
      return null;
    },
  };
}

export function related() {
  if (!built) built = build() as any;
  return built!;
}
