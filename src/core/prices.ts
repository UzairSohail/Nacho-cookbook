/**
 * Costing the shopping list at Woolworths and Coles.
 *
 * Prices come from a daily file built from hotprices.org (see
 * scripts/build-prices.mjs). Each list line is matched to the products whose
 * names fit it best, and the one that's cheapest for the amount needed is
 * suggested. People can pick another product or size, and that pick is saved
 * on the ingredient so every later list uses it.
 *
 * Costs count whole packs: 300 g of flour from a 1 kg bag costs the bag.
 */
import { dimensionOf, parseUnit, toBase, type Dimension, type MeasureStandard } from './units';

export type StoreId = 'woolies' | 'coles';
export const STORES: StoreId[] = ['woolies', 'coles'];
export const STORE_NAMES: Record<StoreId, string> = { woolies: 'Woolworths', coles: 'Coles' };
export const STORE_SHORT: Record<StoreId, string> = { woolies: 'Woolies', coles: 'Coles' };

export type PackUnit = 'g' | 'ml' | 'ea';

/** A product on a store's shelf. `size` is in grams, millilitres or items, per `unit`. */
export interface Product {
  id: string;
  name: string;
  price: number;
  size: number;
  unit: PackUnit;
  produce?: boolean;
}

/** What someone chose for an ingredient. Product details are kept so the list still costs offline. */
export interface PricePick {
  /** The store they'd rather buy it at. Unset means whichever is cheaper. */
  store?: StoreId;
  woolies?: Product;
  coles?: Product;
}

/** The daily price file, as published. */
export interface PriceFile {
  version: number;
  source: string;
  /** Date of the newest price in the file, YYYY-MM-DD. */
  updated: string;
  stores: Record<StoreId, Array<[string, string, number, number, string, number]>>;
}

export interface StoreCatalog {
  products: Product[];
  byId: Map<string, Product>;
  /** Word -> indexes of products whose name contains it. */
  index: Map<string, number[]>;
}

export interface PriceData {
  updated: string;
  stores: Record<StoreId, StoreCatalog>;
}

// ---- words ------------------------------------------------------------------

/** Plural to singular, near enough for matching: tomatoes → tomato, berries → berry, onions → onion. */
export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (/(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(singular);

/** Recipe wording that doesn't describe the product on the shelf. */
const PREP_WORDS = new Set([
  'fresh', 'freshly', 'large', 'small', 'medium', 'finely', 'roughly', 'thinly', 'chopped', 'minced', 'sliced',
  'grated', 'peeled', 'crushed', 'to', 'taste', 'of', 'and', 'or', 'the', 'a', 'an', 'for', 'optional', 'extra',
  'plus', 'about', 'cold', 'warm', 'hot', 'room', 'temperature', 'softened', 'melted', 'packed', 'ripe', 'serve',
  'serving', 'garnish', 'needed', 'divided', 'trimmed', 'halved', 'quartered', 'cubed', 'torn', 'juiced', 'zested',
  'beaten', 'lightly', 'well', 'into', 'cut', 'piece', 'pieces', 'handful', 'pinch', 'some', 'good', 'quality',
  'canned', 'can', 'tin', 'tinned', 'jar', 'block', 'bottle', 'packet',
].map(singular));

/**
 * Words that make a product a different thing from what the recipe means
 * ("egg" is not a Kinder egg, "beef mince" is not cat food), unless the
 * recipe says them too.
 */
const OTHER_THING = new Set([
  'chocolate', 'surprise', 'tuna', 'sardine', 'salmon', 'sausage', 'pesto', 'sauce', 'dip', 'chip', 'cracker',
  'biscuit', 'cake', 'bar', 'snack', 'soup', 'juice', 'cordial', 'drink', 'soft', 'flavour', 'flavoured', 'noodle',
  'seasoning', 'stock', 'mix', 'powder', 'granule', 'microwave', 'microwavable', 'minced', 'crushed', 'paste',
  'dried', 'frozen', 'spread', 'dressing', 'marinade', 'chutney', 'relish', 'pickled', 'pie', 'roll', 'wrap',
  'candle', 'soap', 'shampoo', 'treat', 'infused', 'lolly', 'gummy', 'smoothie', 'tea', 'cookie', 'muffin',
  'replacer', 'noodles', 'ring', 'press', 'naan', 'aioli', 'mayonnaise', 'kit', 'meal', 'bowl', 'cup',
].map(singular));
const PET_WORDS = new Set(['cat', 'dog', 'pet', 'kitten', 'puppy', 'whiskas', 'pedigree', 'purr', 'dine', 'fancy', 'feast'].map(singular));

/** Shelf words that say nothing about what the product is. */
const PACK_WORDS = new Set([
  'woolworth', 'cole', 'macro', 'simply', 'finest', 'essential', 'loose', 'bag', 'punnet', 'bunch', 'each', 'pack',
  'pk', 'prepacked', 'approx', 'kg', 'g', 'ml', 'l', 'x', 'value', 'tray', 'net', 'per',
]);

/** American and British recipe words for what Australian shops call something else. */
const SYNONYMS: Array<[RegExp, string]> = [
  [/\ball[- ]purpose flour\b/, 'plain flour'],
  [/\bpowdered sugar\b|\bconfectioners'? sugar\b/, 'icing sugar'],
  [/\bcornstarch\b/, 'cornflour'],
  [/\bground (beef|pork|chicken|lamb|turkey)\b/, '$1 mince'],
  [/\bminced (beef|pork|chicken|lamb|turkey)\b/, '$1 mince'],
  [/\bbaking soda\b|\bbicarb(onate)? (of )?soda\b/, 'bicarbonate soda'],
  [/\bheavy cream\b|\bheavy whipping cream\b|\bwhipping cream\b|\bdouble cream\b/, 'thickened cream'],
  [/\bscallions?\b|\bgreen onions?\b/, 'spring onion'],
  [/\bcilantro\b/, 'coriander'],
  [/\b(red|green|yellow) bell peppers?\b/, '$1 capsicum'],
  [/\bbell peppers?\b/, 'capsicum'],
  [/\bcourgettes?\b/, 'zucchini'],
  [/\baubergines?\b/, 'eggplant'],
  [/\bgarbanzo beans?\b/, 'chickpeas'],
  [/\bsemisweet\b|\bsemi-sweet\b/, 'dark'],
  [/\bkosher salt\b|\bsea salt flakes\b/, 'salt flakes'],
  [/\bgarlic cloves?\b|\bcloves? (of )?garlic\b/, 'garlic'],
];

/** The words a list line is matched on. */
export function queryWords(name: string): string[] {
  let text = name.toLowerCase().replace(/\(.*?\)/g, ' ').split(',')[0];
  for (const [from, to] of SYNONYMS) text = text.replace(from, to);
  return words(text).filter((w) => !PREP_WORDS.has(w) && !/^\d/.test(w));
}

// ---- the price file -----------------------------------------------------------

const PACK_UNITS = new Set(['g', 'ml', 'ea']);

export function loadPriceData(file: PriceFile): PriceData {
  const stores = {} as Record<StoreId, StoreCatalog>;
  for (const store of STORES) {
    const products: Product[] = [];
    for (const [id, name, price, size, unit, produce] of file.stores?.[store] ?? []) {
      if (!(price > 0) || !(size > 0) || !PACK_UNITS.has(unit)) continue;
      products.push({ id, name, price, size, unit: unit as PackUnit, produce: produce === 1 });
    }
    const index = new Map<string, number[]>();
    products.forEach((p, i) => {
      for (const w of new Set(words(p.name))) {
        const list = index.get(w);
        if (list) list.push(i);
        else index.set(w, [i]);
      }
    });
    stores[store] = { products, byId: new Map(products.map((p) => [p.id, p])), index };
  }
  return { updated: file.updated, stores };
}

// ---- matching -------------------------------------------------------------------

export interface Match {
  product: Product;
  score: number;
}

/**
 * Products whose names contain every word of `name`, best fit first. A fit is
 * better when the name has few other words and ends with the same word (so
 * "garlic" prefers "Woolworths Garlic" to "Garlic Naan").
 */
export function findProducts(
  name: string,
  catalog: StoreCatalog,
  opts: { produce?: boolean; limit?: number; within?: number } = {},
): Match[] {
  const query = queryWords(name);
  if (!query.length) return [];
  const lists = query.map((w) => catalog.index.get(w) ?? []);
  if (lists.some((l) => !l.length)) return [];
  lists.sort((a, b) => a.length - b.length);
  let hits = new Set(lists[0]);
  for (const list of lists.slice(1)) {
    const next = new Set<number>();
    for (const i of list) if (hits.has(i)) next.add(i);
    hits = next;
    if (!hits.size) return [];
  }
  const wanted = new Set(query);
  const head = query[query.length - 1];
  const matches: Match[] = [];
  for (const i of hits) {
    const product = catalog.products[i];
    const all = words(product.name);
    const productWords = all.filter((w) => !PACK_WORDS.has(w) && !/^\d/.test(w));
    let score = 100;
    for (const w of all) {
      if (wanted.has(w)) continue;
      if (PET_WORDS.has(w)) score -= 200;
      else if (OTHER_THING.has(w)) score -= 40;
      // "Pork & Beef Mince" is a mix, not the beef mince the recipe wants.
      else if (w === 'and') score -= 10;
    }
    // "Sardines In Olive Oil", "Tuna With Basil": the recipe's words only come after "in" or "with".
    const joiner = all.findIndex((w) => w === 'in' || w === 'with');
    if (joiner > 0 && !all.slice(0, joiner).some((w) => wanted.has(w))) score -= 50;
    productWords.forEach((w, at) => {
      if (wanted.has(w)) return;
      // The first word is usually the brand, which matters less than "naan" or "sauce".
      score -= at === 0 ? 3 : 8;
    });
    // Ends with the thing itself, or for fruit and veg starts with it ("Onion Brown").
    if (productWords[productWords.length - 1] === head || (product.produce && productWords[0] === head)) score += 25;
    if (opts.produce && product.produce) score += 20;
    matches.push({ product, score });
  }
  matches.sort((a, b) => b.score - a.score || a.product.price - b.product.price);
  // Drop the long tail of poor fits ("brown onion gravy" when looking for brown onions).
  const floor = matches.length ? matches[0].score - (opts.within ?? Infinity) : 0;
  return matches.filter((m) => m.score >= floor).slice(0, opts.limit ?? 40);
}

// ---- amounts and costs ----------------------------------------------------------

/** How much of something the list needs, in grams, millilitres or items. Null amount means "some" (one pack). */
export interface Need {
  amount: number | null;
  dimension: Dimension | null;
}

export function needFor(
  quantity: number | null,
  unit: string | null,
  opts: { standard?: MeasureStandard; density?: number | null } = {},
): Need {
  if (quantity == null || !(quantity > 0)) return { amount: null, dimension: null };
  // No unit is a count: "2 onions".
  const known = parseUnit(unit ?? '');
  if (!known) return { amount: null, dimension: null }; // "2 cloves", "1 can": one pack
  const dimension = dimensionOf(known);
  return { amount: toBase(quantity, known, { standard: opts.standard }), dimension };
}

const PACK_DIMENSION: Record<PackUnit, Dimension> = { g: 'mass', ml: 'volume', ea: 'count' };

/** "12 Pack", "6pk", "x 10": how many items are in a pack sold by weight, if the name says. */
export function itemsInPack(name: string): number | null {
  const m = name.match(/\b(\d+)\s*(?:pack|pk)\b/i) ?? name.match(/\bx\s*(\d+)\b/i) ?? name.match(/\b(\d+)\s*x\b/i);
  const n = m ? Number(m[1]) : NaN;
  return n > 1 ? n : null;
}

/** Packs to buy to cover `need`. Unknown or unlike amounts (2 onions vs a 1 kg bag) buy one pack. */
export function packsFor(need: Need, product: Product, density?: number | null): number {
  if (need.amount == null || !need.dimension) return 1;
  const have = PACK_DIMENSION[product.unit];
  let size: number | null = null;
  if (have === need.dimension) {
    size = product.size;
  } else if (have !== 'count' && need.dimension !== 'count') {
    // Grams vs millilitres: use the density when known, else about 1 g per ml.
    const d = density && density > 0 ? density : 1;
    size = have === 'mass' ? product.size / d : product.size * d;
  } else if (need.dimension === 'count') {
    // Loose fruit and veg is listed at the weight of a typical single one.
    size = /\bloose\b/i.test(product.name) ? 1 : itemsInPack(product.name);
  }
  if (!size) return 1;
  return Math.max(1, Math.ceil(need.amount / size - 1e-6));
}

export interface UnitPrice {
  value: number;
  /** "kg", "L" or "each". */
  per: string;
}

/** Price per kg, per litre or per item, for comparing sizes. */
export function unitPrice(p: Product): UnitPrice {
  if (p.unit === 'g') return { value: (p.price / p.size) * 1000, per: 'kg' };
  if (p.unit === 'ml') return { value: (p.price / p.size) * 1000, per: 'L' };
  return { value: p.price / p.size, per: 'each' };
}

export function formatSize(p: Pick<Product, 'size' | 'unit'>): string {
  const n = (v: number) => String(Math.round(v * 100) / 100);
  if (p.unit === 'g') return p.size >= 1000 ? `${n(p.size / 1000)} kg` : `${n(p.size)} g`;
  if (p.unit === 'ml') return p.size >= 1000 ? `${n(p.size / 1000)} L` : `${n(p.size)} ml`;
  return p.size === 1 ? 'each' : `${n(p.size)} pack`;
}

export const money = (v: number) => `$${v.toFixed(2)}`;

export function formatUnitPrice(p: Product): string {
  const u = unitPrice(p);
  return `${money(u.value)}/${u.per}`;
}

// ---- costing a list line -----------------------------------------------------------

export interface StoreCost {
  store: StoreId;
  product: Product;
  packs: number;
  cost: number;
  /** True when someone chose this product; false for the automatic suggestion. */
  picked: boolean;
}

export interface LineCost {
  woolies: StoreCost | null;
  coles: StoreCost | null;
  /** The store it's costed at: the one picked, or the cheaper one. */
  chosen: StoreId | null;
  /** True when the store was picked rather than worked out. */
  storePicked: boolean;
}

export const costAt = (store: StoreId, product: Product, need: Need, picked: boolean, density?: number | null): StoreCost => {
  const packs = packsFor(need, product, density);
  return { store, product, packs, cost: packs * product.price, picked };
};

/**
 * The automatic suggestion at one store: of the products that fit the name
 * well, the one that costs least for the amount needed.
 */
export function suggest(
  name: string,
  need: Need,
  catalog: StoreCatalog,
  opts: { produce?: boolean; density?: number | null } = {},
): Product | null {
  const matches = findProducts(name, catalog, { produce: opts.produce, limit: 60 });
  if (!matches.length) return null;
  const best = matches[0].score;
  const good = matches.filter((m) => m.score >= best - 12);
  let pick: StoreCost | null = null;
  for (const m of good) {
    const c = costAt('woolies', m.product, need, false, opts.density);
    if (!pick || c.cost < pick.cost - 1e-9 || (Math.abs(c.cost - pick.cost) < 1e-9 && unitPrice(c.product).value < unitPrice(pick.product).value)) {
      pick = c;
    }
  }
  return pick?.product ?? null;
}

export function costLine(
  name: string,
  need: Need,
  data: PriceData | null,
  pick: PricePick | null | undefined,
  opts: { produce?: boolean; density?: number | null } = {},
): LineCost {
  const at = (store: StoreId): StoreCost | null => {
    const saved = pick?.[store];
    if (saved) {
      // Today's price for the picked product, or the price it had when picked if it's gone from the file.
      const fresh = data?.stores[store].byId.get(saved.id);
      return costAt(store, fresh ?? saved, need, true, opts.density);
    }
    if (!data) return null;
    const product = suggest(name, need, data.stores[store], opts);
    return product ? costAt(store, product, need, false, opts.density) : null;
  };
  const woolies = at('woolies');
  const coles = at('coles');
  let chosen: StoreId | null = null;
  let storePicked = false;
  if (pick?.store && (pick.store === 'woolies' ? woolies : coles)) {
    chosen = pick.store;
    storePicked = true;
  } else if (woolies && coles) {
    chosen = coles.cost < woolies.cost ? 'coles' : 'woolies';
  } else {
    chosen = woolies ? 'woolies' : coles ? 'coles' : null;
  }
  return { woolies, coles, chosen, storePicked };
}

export interface ListTotals {
  /** Everything at the store chosen for each line. */
  chosen: number;
  woolies: number;
  coles: number;
  /** Lines with no price at that store (left out of its total). */
  missing: Record<StoreId, number>;
  /** Lines with no price anywhere. */
  unpriced: number;
  priced: number;
  /** Every line at whichever store is cheaper for it. */
  cheapest: number;
  /**
   * What the cheapest mix saves over buying everything at one store, counting
   * only lines both stores have (so a missing item doesn't look like a saving).
   */
  savings: Record<StoreId, number>;
}

export function totalsFor(lines: LineCost[]): ListTotals {
  const t: ListTotals = {
    chosen: 0, woolies: 0, coles: 0, missing: { woolies: 0, coles: 0 }, unpriced: 0, priced: 0,
    cheapest: 0, savings: { woolies: 0, coles: 0 },
  };
  for (const l of lines) {
    if (!l.chosen) {
      t.unpriced += 1;
      continue;
    }
    t.priced += 1;
    t.chosen += l[l.chosen]!.cost;
    for (const s of STORES) {
      const c = l[s];
      if (c) t[s] += c.cost;
      else t.missing[s] += 1;
    }
    const w = l.woolies?.cost;
    const c = l.coles?.cost;
    const low = Math.min(w ?? Infinity, c ?? Infinity);
    t.cheapest += low;
    if (w != null && c != null) {
      t.savings.woolies += w - low;
      t.savings.coles += c - low;
    }
  }
  return t;
}

/** Parses a saved pick, ignoring anything malformed. */
export function parsePricePick(text: unknown): PricePick | null {
  if (typeof text !== 'string' || !text) return null;
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object') return null;
    const product = (p: unknown): Product | undefined => {
      if (!p || typeof p !== 'object') return undefined;
      const o = p as Record<string, unknown>;
      if (typeof o.id !== 'string' || typeof o.name !== 'string' || !(Number(o.price) > 0) || !(Number(o.size) > 0)) return undefined;
      if (!PACK_UNITS.has(String(o.unit))) return undefined;
      return { id: o.id, name: o.name, price: Number(o.price), size: Number(o.size), unit: o.unit as PackUnit };
    };
    const pick: PricePick = {};
    if (raw.store === 'woolies' || raw.store === 'coles') pick.store = raw.store;
    const w = product(raw.woolies);
    const c = product(raw.coles);
    if (w) pick.woolies = w;
    if (c) pick.coles = c;
    return pick.store || pick.woolies || pick.coles ? pick : null;
  } catch {
    return null;
  }
}

export function pricePickText(pick: PricePick | null | undefined): string | null {
  if (!pick || (!pick.store && !pick.woolies && !pick.coles)) return null;
  const strip = (p?: Product) => (p ? { id: p.id, name: p.name, price: p.price, size: p.size, unit: p.unit } : undefined);
  return JSON.stringify({ store: pick.store, woolies: strip(pick.woolies), coles: strip(pick.coles) });
}
