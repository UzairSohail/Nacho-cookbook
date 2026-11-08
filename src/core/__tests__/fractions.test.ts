import { describe, expect, it } from 'vitest';
import { formatDecimal, formatFraction, parseQuantity } from '../fractions';

describe('formatFraction', () => {
  it.each([
    [0.75, '3/4'],
    [1.5, '1 1/2'],
    [1 / 3, '1/3'],
    [2, '2'],
    [1.98, '2'],
    [0.125, '1/8'],
    [2.66, '2 2/3'],
  ])('%d -> %s', (n, s) => expect(formatFraction(n)).toBe(s));

  it('falls back to decimals when no fraction is close', () => {
    expect(formatFraction(0.43)).toBe('0.43');
  });
});

describe('formatDecimal', () => {
  it('rounds by size', () => {
    expect(formatDecimal(123.456)).toBe('123');
    expect(formatDecimal(12.345)).toBe('12.3');
    expect(formatDecimal(1.2345)).toBe('1.23');
  });
});

describe('parseQuantity', () => {
  it.each([
    ['1 1/2', 1.5],
    ['3/4', 0.75],
    ['1.5', 1.5],
    ['1,5', 1.5],
    ['½', 0.5],
    ['1½', 1.5],
  ])('%s -> %d', (s, n) => expect(parseQuantity(s)).toBeCloseTo(n));

  it('rejects junk', () => {
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('1/0')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });
});
