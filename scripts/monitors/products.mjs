import fs from 'node:fs';
import { get } from '../lib/fetch.mjs';

export const id = 'products';
export const label = 'Outbound product links';

const STORE = 'https://ageayurveda.com';

export async function run(state) {
  const findings = [];
  const data = JSON.parse(fs.readFileSync('src/data/products.json', 'utf8'));
  const handles = Object.keys(data.products);
  const broken = [];

  for (const handle of handles) {
    const url = `${STORE}/products/${handle}`;
    const res = await get(url);
    if (!res.ok) {
      broken.push({ handle, status: res.status });
      findings.push({
        fingerprint: `product:${handle}:${res.status}`,
        severity: 'high',
        title: `Product link broken: ${data.products[handle].title} (${res.status || 'no response'})`,
        body: [
          `\`${url}\` returned **${res.status || 'no response'}**.`,
          '',
          `This handle is referenced by \`src/data/products.json\` and appears in the product`,
          'module on every mapped reference page, so readers are being sent to a dead page.',
          '',
          'Fix by either updating the handle in `src/data/products.json` or removing the',
          'mapping if the SKU is discontinued.',
        ].join('\n'),
      });
    }
  }

  state.products = {
    checkedAt: new Date().toISOString(),
    total: handles.length,
    broken: broken.length,
    brokenHandles: broken.map((b) => `${b.handle} (${b.status})`),
  };

  return { findings, metrics: { checked: handles.length, broken: broken.length } };
}
