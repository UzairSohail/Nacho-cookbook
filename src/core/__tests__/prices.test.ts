import { describe, expect, it } from 'vitest';

import {
  costLine,
  findProducts,
  formatSize,
  formatUnitPrice,
  itemsInPack,
  loadPriceData,
  needFor,
  packsFor,
  parsePricePick,
  pricePickText,
  queryWords,
  singular,
  suggest,
  totalsFor,
  type PriceFile,
  type Product,
} from '@/src/core/prices';

// A slice of real hotprices.org products (Nov 2026), in the published format.
const file: PriceFile = {
  version: 1,
  source: 'hotprices.org',
  updated: '2026-11-11',
  stores: {
    woolies: [
      ['w1', 'Woolworths Essentials Plain Flour', 1.3, 1000, 'g', 0],
      ['w2', 'Gem Of The West Plain Flour', 8, 5000, 'g', 0],
      ['w3', 'Woolworths Garlic', 4.2, 3, 'ea', 0],
      ['w4', 'Garlic Naan', 3.9, 2, 'ea', 0],
      ['w5', 'Woolworths Minced Garlic', 1.25, 250, 'g', 0],
      ['w6', 'Maretti Bruschette Roasted Garlic', 3, 150, 'g', 0],
      ['w7', 'Kinder Surprise Milk Chocolate Egg', 2.8, 20, 'g', 0],
      ['w8', 'Woolworths 12 Pack Free Range Eggs', 6.6, 600, 'g', 0],
      ['w9', 'Brunswick Sardines In Olive Oil', 3.1, 106, 'g', 0],
      ['w10', 'Woolworths Mediterranean Mellow Olive Oil', 9, 500, 'ml', 0],
      ['w11', 'Woolworths RSPCA Approved Chicken Thigh Fillets', 9.7, 550, 'g', 0],
      ['w12', 'Woolworths Beef Mince', 7.7, 500, 'g', 0],
      ['w13', 'Woolworths Pork & Beef Mince', 6.25, 500, 'g', 0],
      ['w14', 'Onion Brown', 0.63, 1, 'ea', 1],
      ['w15', 'Woolworths Brown Onions Bag', 5.5, 2000, 'g', 1],
      ['w16', 'Dairy Farmers Full Cream Milk', 3, 1000, 'ml', 0],
      ['w17', 'Broken ruler', 2, 30, 'cm', 0],
    ],
    coles: [
      ['c1', 'Coles Simply Plain Flour', 2.4, 2000, 'g', 0],
      ['c2', 'The Healthy Baker Plain Flour', 2.75, 1000, 'g', 0],
      ['c3', 'Purr Cat Food With Beef Mince', 2.25, 400, 'g', 0],
      ['c4', 'Coles No Added Hormone Beef Regular Mince', 7.7, 500, 'g', 0],
      ['c5', 'Coles Loose Brown Onions', 0.84, 200, 'g', 1],
      ['c6', 'Coles Italian Diced Tomatoes', 1.1, 400, 'g', 0],
      ['c7', 'Coles Lemons', 1.8, 1, 'ea', 0],
      ['c8', 'Coles Lemon Juice', 1.05, 250, 'ml', 0],
    ],
  },
};
const data = loadPriceData(file);
const product = (store: 'woolies' | 'coles', id: string) => data.stores[store].byId.get(id)!;

describe('reading recipe wording', () => {
  it('makes plurals singular', () => {
    expect(['tomatoes', 'berries', 'onions', 'peaches', 'glass', 'asparagus', 'egg'].map(singular)).toEqual([
      'tomato', 'berry', 'onion', 'peach', 'glass', 'asparagus', 'egg',
    ]);
  });

  it('drops preparation words and uses Australian names', () => {
    expect(queryWords('Garlic cloves, finely chopped')).toEqual(['garlic']);
    expect(queryWords('2 cans diced tomatoes')).toEqual(['diced', 'tomato']);
    expect(queryWords('All-purpose flour')).toEqual(['plain', 'flour']);
    expect(queryWords('Ground beef (lean)')).toEqual(['beef', 'mince']);
    expect(queryWords('Cilantro')).toEqual(['coriander']);
  });
});

describe('the price file', () => {
  it('keeps products with a price and a usable size', () => {
    expect(data.stores.woolies.products).toHaveLength(16);
    expect(data.stores.woolies.byId.has('w17')).toBe(false);
    expect(product('woolies', 'w14')).toMatchObject({ unit: 'ea', produce: true });
  });
});

describe('finding products', () => {
  const top = (name: string, store: 'woolies' | 'coles' = 'woolies', produce = false) =>
    findProducts(name, data.stores[store], { produce })[0]?.product.name;

  it('prefers the thing itself to things made with it', () => {
    expect(top('Garlic')).toBe('Woolworths Garlic');
    expect(top('Eggs')).toBe('Woolworths 12 Pack Free Range Eggs');
    expect(top('Olive oil')).toBe('Woolworths Mediterranean Mellow Olive Oil');
    expect(top('Beef mince')).toBe('Woolworths Beef Mince');
    expect(top('Beef mince', 'coles')).toBe('Coles No Added Hormone Beef Regular Mince');
    expect(top('Lemon', 'coles')).toBe('Coles Lemons');
  });

  it('knows Woolworths names loose veg backwards', () => {
    const line = costLine('Brown onion', needFor(2, null), data, null, { produce: true });
    expect(line.woolies).toMatchObject({ product: { name: 'Onion Brown' }, packs: 2, cost: 1.26 });
  });

  it('can leave out poor fits', () => {
    const all = findProducts('Garlic', data.stores.woolies).map((m) => m.product.name);
    const close = findProducts('Garlic', data.stores.woolies, { within: 40 }).map((m) => m.product.name);
    expect(all).toContain('Garlic Naan');
    expect(close).not.toContain('Garlic Naan');
    expect(close[0]).toBe('Woolworths Garlic');
  });

  it('needs every word', () => {
    expect(findProducts('Rye flour', data.stores.woolies)).toEqual([]);
    expect(findProducts('', data.stores.woolies)).toEqual([]);
  });

  it('matches canned items without the word "canned"', () => {
    expect(top('Canned diced tomatoes', 'coles')).toBe('Coles Italian Diced Tomatoes');
  });
});

describe('amounts and packs', () => {
  it('works out what the list needs', () => {
    expect(needFor(300, 'g')).toEqual({ amount: 300, dimension: 'mass' });
    expect(needFor(1.5, 'kg')).toEqual({ amount: 1500, dimension: 'mass' });
    expect(needFor(2, 'tbsp', { standard: 'au' })).toEqual({ amount: 40, dimension: 'volume' });
    expect(needFor(2, null)).toEqual({ amount: 2, dimension: 'count' });
    expect(needFor(3, 'clove')).toEqual({ amount: null, dimension: null });
    expect(needFor(null, null)).toEqual({ amount: null, dimension: null });
  });

  it('buys whole packs', () => {
    const flour = product('woolies', 'w1'); // 1 kg
    expect(packsFor(needFor(300, 'g'), flour)).toBe(1);
    expect(packsFor(needFor(1000, 'g'), flour)).toBe(1);
    expect(packsFor(needFor(1.2, 'kg'), flour)).toBe(2);
    expect(packsFor(needFor(null, null), flour)).toBe(1);
  });

  it('counts items in packs and loose produce', () => {
    expect(itemsInPack('Woolworths 12 Pack Free Range Eggs')).toBe(12);
    expect(itemsInPack('Coke 24 x 375ml')).toBe(24);
    expect(itemsInPack('Plain Flour')).toBeNull();
    expect(packsFor(needFor(18, null), product('woolies', 'w8'))).toBe(2);
    expect(packsFor(needFor(3, null), product('coles', 'c5'))).toBe(3); // loose onions, one each
    expect(packsFor(needFor(3, null), product('woolies', 'w3'))).toBe(1); // 3 garlic bulbs a pack
    expect(packsFor(needFor(2, null), product('woolies', 'w15'))).toBe(1); // 2 kg bag: one will do
  });

  it('treats a millilitre as about a gram unless the density is known', () => {
    const milk = product('woolies', 'w16'); // 1 L
    expect(packsFor(needFor(1200, 'g'), milk)).toBe(2);
    expect(packsFor(needFor(1200, 'ml'), product('woolies', 'w1'), 0.5)).toBe(1); // 1.2 L at 0.5 g/ml = 600 g
  });

  it('shows sizes and prices per kg, litre or item', () => {
    expect(formatSize(product('woolies', 'w2'))).toBe('5 kg');
    expect(formatSize(product('woolies', 'w9'))).toBe('106 g');
    expect(formatSize(product('woolies', 'w10'))).toBe('500 ml');
    expect(formatSize(product('woolies', 'w3'))).toBe('3 pack');
    expect(formatSize(product('woolies', 'w14'))).toBe('each');
    expect(formatUnitPrice(product('woolies', 'w2'))).toBe('$1.60/kg');
    expect(formatUnitPrice(product('woolies', 'w10'))).toBe('$18.00/L');
    expect(formatUnitPrice(product('woolies', 'w3'))).toBe('$1.40/each');
  });
});

describe('costing a line', () => {
  it('suggests the product that costs least for the amount needed', () => {
    // 300 g: the 1 kg bag ($1.30) beats the 5 kg bag ($8) even though the big bag is cheaper per kg.
    expect(suggest('Plain flour', needFor(300, 'g'), data.stores.woolies)!.id).toBe('w1');
    // 4.5 kg: five 1 kg bags ($6.50) still cost less than one 5 kg bag ($8).
    expect(suggest('Plain flour', needFor(4.5, 'kg'), data.stores.woolies)!.id).toBe('w1');
  });

  it('prices both stores and picks the cheaper one', () => {
    const line = costLine('Plain flour', needFor(300, 'g'), data, null);
    expect(line.woolies).toMatchObject({ cost: 1.3, packs: 1, picked: false });
    expect(line.coles).toMatchObject({ cost: 2.4, packs: 1 });
    expect(line.chosen).toBe('woolies');
    expect(line.storePicked).toBe(false);
  });

  it('uses the product and store someone picked, at today’s price', () => {
    const old: Product = { ...product('coles', 'c1'), price: 3.5 };
    const line = costLine('Plain flour', needFor(300, 'g'), data, { store: 'coles', coles: old });
    expect(line.coles).toMatchObject({ cost: 2.4, picked: true });
    expect(line.chosen).toBe('coles');
    expect(line.storePicked).toBe(true);
  });

  it('keeps a picked product’s last price when offline or when it’s gone', () => {
    const gone: Product = { id: 'old', name: 'Discontinued flour', price: 2, size: 1000, unit: 'g' };
    const offline = costLine('Plain flour', needFor(1500, 'g'), null, { woolies: gone });
    expect(offline.woolies).toMatchObject({ cost: 4, packs: 2, picked: true });
    expect(offline.coles).toBeNull();
    expect(offline.chosen).toBe('woolies');
  });

  it('adds up the list, noting what one store doesn’t have', () => {
    const lines = [
      costLine('Plain flour', needFor(300, 'g'), data, null), // W 1.30, C 2.40
      costLine('Lemon', needFor(2, null), data, null, { produce: true }), // C only: 2 × 1.80
      costLine('Saffron', needFor(1, 'g'), data, null), // nowhere
    ];
    const t = totalsFor(lines);
    expect(t.woolies).toBeCloseTo(1.3);
    expect(t.coles).toBeCloseTo(6);
    expect(t.chosen).toBeCloseTo(4.9);
    expect(t.missing).toEqual({ woolies: 1, coles: 0 });
    expect(t.unpriced).toBe(1);
    expect(t.priced).toBe(2);
  });
});

describe('saving picks', () => {
  it('round-trips and ignores rubbish', () => {
    const pick = { store: 'coles' as const, coles: product('coles', 'c1') };
    const text = pricePickText(pick)!;
    expect(parsePricePick(text)).toEqual({ store: 'coles', coles: { id: 'c1', name: 'Coles Simply Plain Flour', price: 2.4, size: 2000, unit: 'g' } });
    expect(pricePickText({})).toBeNull();
    expect(parsePricePick('not json')).toBeNull();
    expect(parsePricePick('{"store":"aldi"}')).toBeNull();
    expect(parsePricePick(JSON.stringify({ woolies: { id: 'x', name: 'y', price: -1, size: 1, unit: 'g' } }))).toBeNull();
  });
});
