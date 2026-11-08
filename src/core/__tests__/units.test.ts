import { describe, expect, it } from 'vitest';
import { bestUnit, convert, convertForSystem, parseUnit } from '../units';

describe('parseUnit', () => {
  it('normalises aliases', () => {
    expect(parseUnit('Cups')).toBe('cup');
    expect(parseUnit('tablespoons')).toBe('tbsp');
    expect(parseUnit('T')).toBe('tbsp');
    expect(parseUnit('t')).toBe('tsp');
    expect(parseUnit('kg.')).toBe('kg');
    expect(parseUnit('')).toBe('piece');
    expect(parseUnit('clove')).toBeNull();
  });
});

describe('convert', () => {
  it('converts within a dimension', () => {
    expect(convert(1, 'kg', 'g')).toBe(1000);
    expect(convert(1, 'lb', 'oz')).toBeCloseTo(16);
    expect(convert(3, 'tsp', 'tbsp')).toBeCloseTo(1);
  });

  it('respects the cup standard', () => {
    expect(convert(1, 'cup', 'ml')).toBe(250);
    expect(convert(1, 'cup', 'ml', { standard: 'us' })).toBeCloseTo(236.59);
    expect(convert(1, 'tbsp', 'ml', { standard: 'au' })).toBe(20);
  });

  it('needs a density to cross volume and weight', () => {
    expect(convert(1, 'cup', 'g')).toBeNull();
    expect(convert(1, 'cup', 'g', { density: 0.53 })).toBeCloseTo(132.5);
    expect(convert(132.5, 'g', 'cup', { density: 0.53 })).toBeCloseTo(1);
  });
});

describe('bestUnit', () => {
  it('steps up metric units', () => {
    expect(bestUnit(1500, 'mass', 'metric')).toEqual({ quantity: 1.5, unit: 'kg' });
    expect(bestUnit(500, 'volume', 'metric')).toEqual({ quantity: 500, unit: 'ml' });
    expect(bestUnit(5, 'volume', 'metric')).toEqual({ quantity: 1, unit: 'tsp' });
  });

  it('picks imperial units', () => {
    expect(bestUnit(453.59237, 'mass', 'imperial')).toEqual({ quantity: 1, unit: 'lb' });
    expect(bestUnit(125, 'volume', 'imperial').unit).toBe('cup');
  });
});

describe('convertForSystem', () => {
  it('converts grams to ounces for imperial', () => {
    const m = convertForSystem(250, 'g', 'imperial');
    expect(m.unit).toBe('oz');
    expect(m.quantity).toBeCloseTo(8.82, 2);
  });

  it('keeps cups in metric', () => {
    expect(convertForSystem(0.75, 'cup', 'metric')).toEqual({ quantity: 0.75, unit: 'cup' });
  });

  it('steps teaspoons up to tablespoons', () => {
    expect(convertForSystem(12, 'tsp', 'imperial')).toEqual({ quantity: 4, unit: 'tbsp' });
    expect(convertForSystem(1, 'tsp', 'imperial')).toEqual({ quantity: 1, unit: 'tsp' });
  });
});
