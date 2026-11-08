import { describe, expect, it } from 'vitest';
import { factorForServings, formatAmount, limitingFactor, scaleIngredients } from '../scaling';
import { catalog, pancakes } from './fixtures';

describe('scaling by servings', () => {
  it('works out the factor', () => {
    expect(factorForServings(pancakes, 6)).toBe(1.5);
    expect(factorForServings(pancakes, 2)).toBe(0.5);
  });
});

describe('limiting ingredient', () => {
  it('scales down when you have 3/4 cup of milk', () => {
    const r = limitingFactor(pancakes, [{ index: 0, quantity: 0.75, unit: 'cup' }], catalog);
    expect(r?.factor).toBeCloseTo(0.75);
    const scaled = scaleIngredients(pancakes, r!.factor);
    expect(scaled[1].scaledQuantity).toBeCloseTo(112.5); // flour
    expect(scaled[2].scaledQuantity).toBeCloseTo(1.5); // eggs
    expect(scaled[2].partialCount).toBe(true);
    expect(scaled[3].scaledQuantity).toBeNull(); // salt to taste stays unscaled
  });

  it('scales up when you have more', () => {
    const r = limitingFactor(pancakes, [{ index: 0, quantity: 500, unit: 'ml' }], catalog);
    expect(r?.factor).toBe(2);
  });

  it('picks the smallest ratio when several are entered', () => {
    const r = limitingFactor(
      pancakes,
      [
        { index: 0, quantity: 2, unit: 'cups' }, // 2x
        { index: 2, quantity: 3, unit: '' }, // 1.5x
        { index: 1, quantity: 1, unit: 'kg' }, // 6.67x
      ],
      catalog,
    );
    expect(r?.factor).toBe(1.5);
    expect(r?.limitingIndex).toBe(2);
  });

  it('converts across weight and volume using density', () => {
    // 150 g flour needed; 1 cup = 250 ml * 0.53 = 132.5 g
    const r = limitingFactor(pancakes, [{ index: 1, quantity: 1, unit: 'cup' }], catalog);
    expect(r?.factor).toBeCloseTo(132.5 / 150);
  });

  it('skips amounts it cannot compare', () => {
    const r = limitingFactor(pancakes, [{ index: 2, quantity: 100, unit: 'g' }], catalog);
    expect(r).toBeNull();
  });
});

describe('formatAmount', () => {
  it('shows kitchen fractions', () => {
    expect(formatAmount(0.75, 'cup', 'metric')).toEqual({ quantity: '3/4', unit: 'cup' });
    expect(formatAmount(1.5, 'cups', 'metric')).toEqual({ quantity: '1 1/2', unit: 'cups' });
  });

  it('converts and rounds for imperial', () => {
    expect(formatAmount(250, 'g', 'imperial')).toEqual({ quantity: '8.82', unit: 'oz' });
  });

  it('keeps free-text units', () => {
    expect(formatAmount(1.5, 'cloves', 'metric')).toEqual({ quantity: '1 1/2', unit: 'cloves' });
  });
});
