import { describe, expect, it } from 'vitest';
import { buildBatches, entryRoles, fortnightDates, mondayOf, today } from '../planner';
import type { PlanEntry } from '../types';
import { recipes } from './fixtures';

describe('dates', () => {
  it("uses the device's own date for today, not UTC", () => {
    expect(today(new Date(2026, 10, 9, 7, 30))).toBe('2026-11-09');
    expect(today(new Date(2026, 10, 8, 23, 59))).toBe('2026-11-08');
  });

  it('finds the Monday', () => {
    expect(mondayOf('2026-11-08')).toBe('2026-11-02'); // Sunday -> previous Monday
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
  });

  it('builds 14 days from Monday', () => {
    const days = fortnightDates('2026-11-11');
    expect(days).toHaveLength(14);
    expect(days[0]).toBe('2026-11-09');
    expect(days[13]).toBe('2026-11-22');
  });
});

const entry = (id: string, date: string, recipeId: string, servings = 1): PlanEntry => ({
  id, date, slot: 'breakfast', recipeId, servings,
});

describe('batches', () => {
  it('cooks a 3-serving breakfast once for 3 days', () => {
    const batches = buildBatches(
      [entry('a', '2026-11-09', 'oats'), entry('b', '2026-11-10', 'oats'), entry('c', '2026-11-11', 'oats')],
      recipes,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].factor).toBe(1);
    const roles = entryRoles(batches);
    expect(roles.get('a')?.kind).toBe('cook');
    expect(roles.get('b')?.kind).toBe('leftovers');
  });

  it('allows non-adjacent days within keeps-for', () => {
    const batches = buildBatches([entry('a', '2026-11-09', 'oats'), entry('b', '2026-11-12', 'oats')], recipes);
    expect(batches).toHaveLength(1);
  });

  it('starts a new batch past keeps-for', () => {
    const batches = buildBatches([entry('a', '2026-11-09', 'oats'), entry('b', '2026-11-13', 'oats')], recipes);
    expect(batches).toHaveLength(2);
    expect(batches.map((b) => b.factor)).toEqual([1 / 3, 1 / 3]);
  });

  it('scales a batch to exact servings for two people', () => {
    const batches = buildBatches(
      [entry('a', '2026-11-09', 'oats', 2), entry('b', '2026-11-10', 'oats', 2)],
      recipes,
    );
    expect(batches[0].factor).toBeCloseTo(4 / 3);
  });
});
