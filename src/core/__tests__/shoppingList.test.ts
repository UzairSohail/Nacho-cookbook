import { describe, expect, it } from 'vitest';
import { generateShoppingList, listToText, reconcileList, type ListItem } from '../shoppingList';
import type { PlanEntry } from '../types';
import { catalog, recipes } from './fixtures';

const range = { start: '2026-11-09', end: '2026-11-22' };
const e = (id: string, date: string, recipeId: string, servings: number, slot: PlanEntry['slot'] = 'dinner'): PlanEntry => ({
  id, date, slot, recipeId, servings,
});

const generate = (entries: PlanEntry[]) =>
  generateShoppingList({ entries, recipes, catalog, range, system: 'metric' });

const find = <T extends { ingredientId: string }>(items: T[], id: string) => items.find((i) => i.ingredientId === id);

describe('generateShoppingList', () => {
  it('buys a 3-serving recipe once when eaten over 3 days', () => {
    const { items } = generate([
      e('a', '2026-11-09', 'oats', 1, 'breakfast'),
      e('b', '2026-11-10', 'oats', 1, 'breakfast'),
      e('c', '2026-11-11', 'oats', 1, 'breakfast'),
    ]);
    expect(find(items, 'oats')).toMatchObject({ quantity: 150, unit: 'g' });
  });

  it('scales to exact servings', () => {
    const { items } = generate([e('a', '2026-11-09', 'oats', 4, 'breakfast')]);
    expect(find(items, 'oats')?.quantity).toBeCloseTo(200);
  });

  it('merges the same ingredient across recipes and units', () => {
    // Pancakes x1: 150 g flour. Garlic bread x1: 1 cup flour = 132.5 g.
    const { items } = generate([e('a', '2026-11-09', 'pancakes', 4), e('b', '2026-11-10', 'bread', 2)]);
    const flour = find(items, 'flour');
    expect(flour?.unit).toBe('g');
    expect(flour?.quantity).toBeCloseTo(282.5);
    expect(flour?.sources).toEqual(['Garlic bread', 'Pancakes']);
    // Milk: 1 cup (250 ml) -> by weight because density is known
    expect(find(items, 'milk')?.unit).toBe('g');
  });

  it('keeps free-text units separately', () => {
    const { items } = generate([e('b', '2026-11-10', 'bread', 4)]);
    expect(find(items, 'garlic')).toMatchObject({ quantity: 6, unit: 'cloves' });
  });

  it('keeps pantry things on the generated list (the screen moves them to "already at home")', () => {
    const { items } = generate([e('a', '2026-11-09', 'pancakes', 4)]);
    expect(find(items, 'salt')).toBeDefined();
  });

  it('drops a to-taste line when the item is also bought by amount', () => {
    const { items } = generate([e('a', '2026-11-09', 'pancakes', 4), e('b', '2026-11-10', 'bread', 2)]);
    const salt = items.filter((i) => i.ingredientId === 'salt');
    expect(salt).toHaveLength(1);
    expect(salt[0].quantity).not.toBeNull();
  });

  it('ignores entries outside the range', () => {
    const { items } = generate([e('a', '2026-12-01', 'oats', 3)]);
    expect(items).toHaveLength(0);
  });

  it('sorts by aisle', () => {
    const { items } = generate([e('a', '2026-11-09', 'pancakes', 4), e('b', '2026-11-10', 'bread', 2)]);
    expect(items[0].aisle).toBe('produce');
  });
});

describe('reconcileList', () => {
  let n = 0;
  const newId = () => `new-${++n}`;
  const base: ListItem = {
    id: '1', key: 'oats|mass', name: 'Rolled oats', quantity: 150, unit: 'g', aisle: 'pantry',
    checked: true, edited: false, sources: ['Overnight oats'],
  };
  const manual: ListItem = {
    id: '2', name: 'Dish soap', quantity: null, unit: null, aisle: 'household', checked: false, edited: false, sources: [],
  };

  it('updates amounts, keeps ticks and manual lines', () => {
    const { items } = generate([e('a', '2026-11-09', 'oats', 6, 'breakfast')]);
    const result = reconcileList([base, manual], items, new Set(), newId);
    const oats = result.find((i) => i.key === 'oats|mass');
    expect(oats?.quantity).toBeCloseTo(300);
    expect(oats?.checked).toBe(true);
    expect(result).toContainEqual(manual);
    expect(result.some((i) => i.key === 'milk|mass')).toBe(true);
  });

  it('keeps hand-edited amounts', () => {
    const edited = { ...base, quantity: 500, edited: true };
    const { items } = generate([e('a', '2026-11-09', 'oats', 6, 'breakfast')]);
    const result = reconcileList([edited], items, new Set(), newId);
    expect(result.find((i) => i.key === 'oats|mass')?.quantity).toBe(500);
  });

  it('drops lines no longer needed and respects deletions', () => {
    const { items } = generate([e('a', '2026-11-09', 'oats', 3, 'breakfast')]);
    const result = reconcileList(
      [{ ...base, key: 'flour|mass' }],
      items,
      new Set(['milk|mass']),
      newId,
    );
    expect(result.map((i) => i.key)).toEqual(['oats|mass']);
  });
});

describe('listToText', () => {
  it('groups unticked items by aisle', () => {
    const items: ListItem[] = [
      { id: '1', key: 'a', name: 'Milk', quantity: 1, unit: 'l', aisle: 'dairy', checked: false, edited: false, sources: [] },
      { id: '2', key: 'b', name: 'Garlic', quantity: 3, unit: 'cloves', aisle: 'produce', checked: false, edited: false, sources: [] },
      { id: '3', key: 'c', name: 'Eggs', quantity: 6, unit: null, aisle: 'dairy', checked: true, edited: false, sources: [] },
    ];
    const text = listToText(items, (q, u) => `${q}${u ? ` ${u}` : ''}`);
    expect(text).toBe('Shopping list\n\nFruit & veg\n- 3 cloves Garlic\n\nDairy & eggs\n- 1 l Milk');
  });
});
