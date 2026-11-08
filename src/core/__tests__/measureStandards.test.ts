import { describe, expect, it } from 'vitest';
import { formatAmount, limitingFactor } from '../scaling';
import { generateShoppingList } from '../shoppingList';
import type { Recipe } from '../types';
import { convert } from '../units';
import { catalog } from './fixtures';

// An American recipe used in an Australian kitchen.
const usCookies: Recipe = {
  id: 'cookies',
  title: 'US cookies',
  servings: 12,
  measureStandard: 'us',
  ingredients: [
    { ingredientId: 'butter', quantity: 2, unit: 'tbsp', scalable: true },
    { ingredientId: 'milk', quantity: 1, unit: 'cup', scalable: true },
    { ingredientId: 'flour', quantity: 2, unit: 'cups', scalable: true },
  ],
  steps: [],
};

describe('recipes written with other cup and spoon sizes', () => {
  it('converts between standards', () => {
    expect(convert(1, 'tbsp', 'tbsp', { standard: 'us', toStandard: 'au' })).toBeCloseTo(0.739, 3);
  });

  it('shows US spoons as Australian spoons', () => {
    // 2 US tbsp = 29.6 ml = about 1 1/2 Australian tbsp
    expect(formatAmount(2, 'tbsp', 'metric', { standard: 'au', sourceStandard: 'us' })).toEqual({
      quantity: '1 1/2',
      unit: 'tbsp',
    });
  });

  it('labels US cups rather than converting them', () => {
    expect(formatAmount(2, 'cups', 'metric', { standard: 'au', sourceStandard: 'us' })).toEqual({
      quantity: '2',
      unit: 'US cups',
    });
  });

  it('leaves amounts alone when the standards match', () => {
    expect(formatAmount(2, 'tbsp', 'metric', { standard: 'au', sourceStandard: 'au' })).toEqual({
      quantity: '2',
      unit: 'tbsp',
    });
  });

  it('compares what you have in Australian cups with US cups in the recipe', () => {
    // 1 AU cup (250 ml) of milk against 1 US cup (236.6 ml) needed
    const r = limitingFactor(usCookies, [{ index: 1, quantity: 1, unit: 'cup' }], catalog, { standard: 'au' });
    expect(r?.factor).toBeCloseTo(250 / 236.588, 3);
  });

  it('buys the right amount for a US recipe', () => {
    const { items } = generateShoppingList({
      entries: [{ id: 'a', date: '2026-11-09', slot: 'dessert', recipeId: 'cookies', servings: 12 }],
      recipes: new Map([[usCookies.id, usCookies]]),
      catalog,
      range: { start: '2026-11-09', end: '2026-11-22' },
      system: 'metric',
      standard: 'au',
    });
    // 2 US cups flour = 473.2 ml x 0.53 g/ml
    expect(items.find((i) => i.ingredientId === 'flour')?.quantity).toBeCloseTo(250.79, 1);
  });
});
