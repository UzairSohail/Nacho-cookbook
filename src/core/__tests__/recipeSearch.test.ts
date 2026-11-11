import { describe, expect, it } from 'vitest';
import { searchRecipes } from '../recipeSearch';
import type { Recipe } from '../types';

const r = (id: string, title: string, extra: Partial<Recipe> = {}): Recipe => ({
  id,
  title,
  servings: 2,
  ingredients: [],
  steps: [],
  ...extra,
});

const all = [
  r('1', 'Chicken Tikka Masala'),
  r('2', 'Butter Chicken'),
  r('3', 'Spaghetti Bolognese', { tags: ['pasta'] }),
  r('4', 'Crème Brûlée'),
  r('5', 'Lamb curry', { ingredients: [{ ingredientId: 'i-chick', amount: 1, unit: 'g', scalable: true } as never] }),
  r('6', 'Pancakes'),
];
const names = new Map([['i-chick', 'chickpeas']]);

describe('searchRecipes', () => {
  it('returns nothing for an empty query', () => {
    expect(searchRecipes('  ', all)).toEqual([]);
  });

  it('puts title starts first, then word starts, then ingredient matches', () => {
    expect(searchRecipes('chick', all, (id) => names.get(id)).map((x) => x.id)).toEqual(['1', '2', '5']);
  });

  it('matches inside words and ignores case', () => {
    expect(searchRecipes('ANCAK', all).map((x) => x.id)).toEqual(['6']);
  });

  it('matches tags', () => {
    expect(searchRecipes('pasta', all).map((x) => x.id)).toEqual(['3']);
  });

  it('ignores accents', () => {
    expect(searchRecipes('creme bru', all).map((x) => x.id)).toEqual(['4']);
  });

  it('limits the number of results', () => {
    expect(searchRecipes('a', all, undefined, 2)).toHaveLength(2);
  });
});
