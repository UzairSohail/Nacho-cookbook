import { describe, expect, it } from 'vitest';
import { kitchenAmount, roundCount } from '../kitchenAmount';

const au = { standard: 'metric' as const };
const text = (q: number, unit: string | null, opts = {}) => kitchenAmount(q, unit, 'metric', { ...au, ...opts }).text;

describe('kitchenAmount: things you count', () => {
  it('rounds 0.92 eggs to 1', () => {
    expect(text(12 / 13, null, { name: 'Large egg' })).toBe('1');
    expect(kitchenAmount(12 / 13, null, 'metric', { name: 'Large egg' }).note).toBeUndefined();
  });

  it('uses halves for small counts and explains half an egg', () => {
    expect(roundCount(1.4)).toBe(1.5);
    expect(roundCount(2.2)).toBe(2);
    expect(roundCount(0.3)).toBe(0.25);
    expect(roundCount(4.6)).toBe(5);
    expect(roundCount(0.05)).toBe(0.25);
    const egg = kitchenAmount(0.5, null, 'metric', { name: 'Egg' });
    expect(egg).toEqual({ text: '1/2', note: 'Beat 1 egg and use half of it' });
    expect(kitchenAmount(1.5, '', 'metric', { name: 'Eggs' }).note).toBe('1 whole, plus half of a beaten egg');
  });

  it('keeps free-text units', () => {
    expect(text(2.6, 'cloves')).toBe('2 1/2 cloves');
    expect(text(0.92, 'can')).toBe('1 can');
  });
});

describe('kitchenAmount: cups', () => {
  it('turns 1 7/8 cups into a cup measure plus spoons', () => {
    expect(text(1.875, 'cups')).toBe('1 3/4 cups + 2 tbsp');
  });

  it('snaps to a cup in the set when close', () => {
    expect(text(0.75, 'cup')).toBe('3/4 cup');
    expect(text(0.26, 'cup')).toBe('1/4 cup');
    expect(text(1.49, 'cups')).toBe('1 1/2 cups');
    expect(text(0.33, 'cup')).toBe('1/3 cup');
    expect(text(2, 'cups')).toBe('2 cups');
  });

  it('labels US cups and tops up with household spoons', () => {
    expect(text(1.875, 'cups', { sourceStandard: 'us' })).toBe('1 3/4 US cups + 2 tbsp');
  });

  it('uses spoons for under a quarter cup', () => {
    expect(text(0.125, 'cup')).toBe('2 tbsp');
  });
});

describe('kitchenAmount: spoons', () => {
  it('turns 1 1/4 tbsp into 1 tbsp + 3/4 tsp', () => {
    expect(text(1.25, 'tbsp')).toBe('1 tbsp + 3/4 tsp');
  });

  it('keeps whole and half tablespoons', () => {
    expect(text(1.5, 'tbsp')).toBe('1 1/2 tbsp');
    expect(text(2, 'tbsp', { sourceStandard: 'us' })).toBe('2 tbsp');
    expect(text(1.5, 'tbsp', { standard: 'au' })).toBe('1 1/2 tbsp');
  });

  it('rounds teaspoons to measuring-spoon sizes', () => {
    expect(text(0.92, 'tsp')).toBe('1 tsp');
    expect(text(0.46, 'tsp')).toBe('1/2 tsp');
    expect(text(0.7, 'tsp')).toBe('3/4 tsp');
    expect(text(0.15, 'tsp')).toBe('1/8 tsp');
    expect(text(0.05, 'tsp')).toBe('a pinch');
    expect(text(2.9, 'tsp')).toBe('1 tbsp');
    expect(text(3.9, 'tsp')).toBe('1 tbsp + 1 tsp');
  });
});

describe('kitchenAmount: metric', () => {
  it('rounds grams and millilitres like a scale or jug', () => {
    expect(text(7.69, 'g')).toBe('8 g');
    expect(text(2.3, 'g')).toBe('2.5 g');
    expect(text(153.8, 'g')).toBe('155 g');
    expect(text(461.5, 'ml')).toBe('460 ml');
    expect(text(1.23, 'kg')).toBe('1.25 kg');
  });

  it('rounds imperial weights to quarters', () => {
    expect(kitchenAmount(250, 'g', 'imperial').text).toBe('8 3/4 oz');
  });
});

describe('kitchenAmount: cups or metric view', () => {
  const view = (q: number, unit: string, name: string, v: 'cups' | 'metric') =>
    kitchenAmount(q, unit, 'metric', { standard: 'metric', name, view: v }).text;

  it('shows flour in grams and milk in ml', () => {
    expect(view(1.875, 'cups', 'Plain / all purpose flour', 'metric')).toBe('250 g');
    expect(view(1.625, 'cups', 'Cups milk', 'metric')).toBe('410 ml');
    expect(view(4, 'cups', 'Water', 'metric')).toBe('1 L');
  });

  it('keeps small amounts as spoons', () => {
    expect(view(1.25, 'tbsp', 'Baking powder', 'metric')).toBe('1 tbsp + 3/4 tsp');
  });

  it('turns grams into cups when the density is known', () => {
    expect(view(125, 'g', 'Butter', 'cups')).toBe('1/2 cup');
    expect(view(300, 'ml', 'Milk', 'cups')).toBe('1 cup + 3 1/2 tbsp');
    expect(view(200, 'g', 'Chicken thighs', 'cups')).toBe('200 g');
  });

  it('uses a saved density over the guess', () => {
    expect(kitchenAmount(1, 'cup', 'metric', { name: 'Mystery', density: 0.6, view: 'metric' }).text).toBe('150 g');
  });
});
