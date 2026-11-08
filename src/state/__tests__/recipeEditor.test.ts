import { describe, expect, it } from 'vitest';

import { parseQuantity } from '@/src/core';
import { reducer, ingredientIdForName, withSampleRecipes, type State } from '../reducer';
import {
  amountText,
  draftFromRecipe,
  draftToRecipe,
  emptyDraft,
  hasErrors,
  linesFromText,
  stepsFromText,
  validateDraft,
  type RecipeDraft,
} from '../recipeDraft';
import { diffState } from '../rows';

const H = '11111111-1111-4111-8111-111111111111';

function empty(): State {
  return {
    householdId: H,
    settings: { householdSize: 2, system: 'metric', standard: 'au' },
    recipes: [], ingredients: [], plan: [], pantry: [], list: [], dismissedKeys: [],
  };
}

function curryDraft(): RecipeDraft {
  return {
    ...emptyDraft(),
    title: '  Butter chicken ',
    servings: '4',
    prepMinutes: '15',
    cookMinutes: '40',
    tags: 'dinner, curry, dinner',
    usMeasures: true,
    lines: [
      ...linesFromText('500 g chicken thighs\nFor the sauce:\n1 cup cream\n2 cloves garlic, crushed\nSalt, to taste\n'),
      { kind: 'ingredient', key: 'blank', amount: '', unit: '', name: '', note: '', optional: false },
    ],
    steps: stepsFromText('1. Brown the chicken.\n\n2) Add the sauce and simmer.'),
  };
}

describe('recipe draft', () => {
  it('reads amounts back exactly', () => {
    for (const q of [1, 1.5, 0.75, 1 / 3, 0.43, 2.66]) {
      const text = amountText(q);
      expect(parseQuantity(text)).toBeCloseTo(q, 9);
    }
    expect(amountText(null)).toBe('');
  });

  it('turns a draft into a recipe with groups, unscaled "to taste" items and clean tags', () => {
    const d = curryDraft();
    expect(hasErrors(validateDraft(d))).toBe(false);
    const r = draftToRecipe(d);
    expect(r.title).toBe('Butter chicken');
    expect(r.measureStandard).toBe('us');
    expect(r.tags).toEqual(['dinner', 'curry']);
    expect(r.steps.map((s) => s.text)).toEqual(['Brown the chicken.', 'Add the sauce and simmer.']);
    expect(r.ingredients.map((i) => [i.name, i.quantity, i.unit, i.group, i.scalable])).toEqual([
      ['Chicken thighs', 500, 'g', undefined, true],
      ['Cream', 1, 'cup', 'For the sauce', true],
      ['Garlic', 2, 'cloves', 'For the sauce', true],
      ['Salt', null, null, 'For the sauce', false],
    ]);
  });

  it('flags missing names, bad numbers and bad amounts', () => {
    const d = emptyDraft();
    d.servings = '0';
    d.prepMinutes = 'ten';
    d.keepsForDays = '0';
    d.lines = [
      { kind: 'ingredient', key: 'a', amount: 'lots', unit: '', name: 'Flour', note: '', optional: false },
      { kind: 'ingredient', key: 'b', amount: '2', unit: '', name: '', note: '', optional: false },
    ];
    const e = validateDraft(d);
    expect(e.title).toBeTruthy();
    expect(e.servings).toBeTruthy();
    expect(e.prepMinutes).toBeTruthy();
    expect(e.keepsForDays).toBeTruthy();
    expect(Object.keys(e.lines).sort()).toEqual(['a', 'b']);
  });

  it('round-trips every sample recipe through the editor unchanged', () => {
    const state = withSampleRecipes(empty());
    const cat = new Map(state.ingredients.map((i) => [i.id, i]));
    for (const r of state.recipes) {
      const after = reducer(state, { type: 'saveRecipe', recipe: draftToRecipe(draftFromRecipe(r, cat), r) });
      expect(diffState(state, after), r.title).toEqual([]);
    }
  });
});

describe('saving and deleting recipes', () => {
  it('adds a recipe, reusing ingredients by name and adding new ones once', () => {
    const start = withSampleRecipes(empty());
    const input = draftToRecipe(curryDraft());
    const saved = reducer(start, { type: 'saveRecipe', recipe: input });
    expect(saved.recipes).toHaveLength(start.recipes.length + 1);

    const garlicId = start.ingredients.find((i) => i.name === 'Garlic')!.id;
    const recipe = saved.recipes.find((r) => r.id === input.id)!;
    expect(recipe.ingredients[2].ingredientId).toBe(garlicId);

    const added = saved.ingredients.slice(start.ingredients.length);
    expect(added.map((i) => [i.name, i.aisle])).toEqual([['Cream', 'dairy']]);
    expect(added[0].id).toBe(ingredientIdForName(H, 'cream'));

    const writes = diffState(start, saved);
    expect(writes.filter((w) => w.table === 'ingredients').map((w) => w.op)).toEqual(['insert']);
    expect(writes.filter((w) => w.table === 'recipes').map((w) => w.op)).toEqual(['insert']);
    expect(writes.filter((w) => w.table === 'recipe_ingredients')).toHaveLength(4);
  });

  it('edits a recipe in place, removing rows for dropped ingredients', () => {
    const input = draftToRecipe(curryDraft());
    const s1 = reducer(empty(), { type: 'saveRecipe', recipe: input });
    const edited = { ...input, title: 'Mild butter chicken', ingredients: input.ingredients.slice(0, 2) };
    const s2 = reducer(s1, { type: 'saveRecipe', recipe: edited });
    expect(s2.recipes).toHaveLength(1);
    const writes = diffState(s1, s2);
    expect(writes.filter((w) => w.table === 'recipes')).toEqual([
      { op: 'update', table: 'recipes', id: input.id, data: { title: 'Mild butter chicken' } },
    ]);
    expect(writes.filter((w) => w.table === 'recipe_ingredients').map((w) => w.op)).toEqual(['delete', 'delete']);
  });

  it('deletes a recipe with its rows and planned meals, children first', () => {
    let s = withSampleRecipes(empty());
    const target = s.recipes[0];
    s = reducer(s, { type: 'setMeal', date: '2026-11-09', slot: 'dinner', recipeId: target.id });
    s = reducer(s, { type: 'setMeal', date: '2026-11-10', slot: 'dinner', recipeId: s.recipes[1].id });
    const after = reducer(s, { type: 'deleteRecipe', id: target.id });
    expect(after.recipes.some((r) => r.id === target.id)).toBe(false);
    expect(after.plan).toHaveLength(1);
    // The catalog keeps its ingredients for other recipes.
    expect(after.ingredients).toBe(s.ingredients);

    const writes = diffState(s, after);
    expect(writes.every((w) => w.op === 'delete')).toBe(true);
    const tables = writes.map((w) => w.table);
    expect(tables.lastIndexOf('recipe_ingredients')).toBeLessThan(tables.indexOf('recipes'));
    expect(tables.lastIndexOf('recipe_steps')).toBeLessThan(tables.indexOf('recipes'));
    expect(tables.indexOf('plan_entries')).toBeLessThan(tables.indexOf('recipes'));
  });
});
