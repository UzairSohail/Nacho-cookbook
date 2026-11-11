// Builds the price list the app uses to cost the shopping list.
//
// Woolworths and Coles prices come from hotprices.org, an open-source tracker
// (https://github.com/Javex/hotprices-au) that publishes both stores' online
// prices once a day. This script downloads its two files, keeps only what the
// app needs (name, price, pack size) and writes one small JSON file:
//
//   node scripts/build-prices.mjs <output folder>
//
// Run daily by the "Publish web app" workflow, which serves the result at
// https://uzairsohail.github.io/Nacho-cookbook/prices/prices.json
//
// If hotprices.org can't be reached, the copy that's already published is kept,
// so the app carries on with the last prices it had.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const SOURCE = 'https://hotprices.org/data/latest-canonical.{store}.compressed.json.gz';
const PUBLISHED = 'https://uzairsohail.github.io/Nacho-cookbook/prices/prices.json';
const STORES = { woolies: 'woolies', coles: 'coles' };
// hotprices' fruit and veg categories, so "lemon" finds lemons before lemon cordial.
const PRODUCE = new Set(['000', '001', '002', '003']);
const UNITS = new Set(['g', 'ml', 'ea']);

const outDir = process.argv[2] ?? 'dist/prices';

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'NachoCookbook/1.0 (+https://github.com/UzairSohail/Nacho-cookbook)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The files are gzipped, but some servers say so in a header and fetch has already unpacked them. */
function unzip(buf) {
  return (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString('utf8');
}

/** One product as the app stores it: [id, name, price, pack size, unit, produce 0/1]. */
function slim(item) {
  const price = Number(item.price);
  const qty = Number(item.quantity);
  if (!item.name || !(price > 0) || !(qty > 0) || !UNITS.has(item.unit)) return null;
  return [String(item.id), String(item.name).trim(), price, qty, item.unit, PRODUCE.has(item.category) ? 1 : 0];
}

async function build() {
  const stores = {};
  let updated = '';
  for (const [key, name] of Object.entries(STORES)) {
    const items = JSON.parse(unzip(await download(SOURCE.replace('{store}', name))));
    if (!Array.isArray(items) || items.length < 1000) throw new Error(`${name}: only ${items?.length ?? 0} products`);
    stores[key] = items.map(slim).filter(Boolean);
    for (const item of items) {
      const date = item.priceHistory?.[0]?.date;
      if (typeof date === 'string' && date > updated) updated = date;
    }
    console.log(`${name}: ${stores[key].length} products`);
  }
  return { version: 1, source: 'hotprices.org', updated, stores };
}

let data;
try {
  data = await build();
} catch (e) {
  console.warn(`Could not build fresh prices (${e.message}); keeping the published copy.`);
  try {
    const res = await fetch(PUBLISHED);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e2) {
    console.warn(`No published copy either (${e2.message}); the app will show no prices.`);
    process.exit(0);
  }
}

await mkdir(outDir, { recursive: true });
const body = JSON.stringify(data);
await writeFile(join(outDir, 'prices.json'), body);
console.log(`Wrote ${join(outDir, 'prices.json')} (${(body.length / 1e6).toFixed(1)} MB, prices from ${data.updated})`);
