import { describe, expect, it } from 'vitest';

import { guessAisle, splitByPantry } from '@/src/core';
import { reducer, withSampleRecipes, type State } from '../reducer';
import { diffState } from '../rows';

const H = '11111111-1111-4111-8111-111111111111';
const fortnight = { start: '2026-11-09', end: '2026-11-22' };

function planned(): State {
  let state: State = withSampleRecipes({
    householdId: H,
    settings: { householdSize: 2, system: 'metric', standard: 'au' },
    recipes: [], ingredients: [], plan: [], pantry: [], list: [], dismissedKeys: [],
  });
  state = { ...state, pantry: [] };
  const curry = state.recipes.find((r) => /curry/i.test(r.title))!;
  state = reducer(state, { type: 'setMeal', date: '2026-11-10', slot: 'dinner', recipeId: curry.id });
  return reducer(state, { type: 'generateList', range: fortnight });
}

describe('pantry', () => {
  it('adds something no recipe uses yet, as a new ingredient with a guessed aisle', () => {
    const before = planned();
    const state = reducer(before, { type: 'addToPantry', name: ' baby corn ' });
    const corn = state.ingredients.find((i) => i.name === 'Baby corn')!;
    expect(corn.aisle).toBe('produce');
    expect(state.pantry).toContain(corn.id);
    // The new ingredient and the pantry row both sync to the household.
    expect(diffState(before, state).map((w) => w.table).sort()).toEqual(['ingredients', 'pantry_staples']);
  });

  it('reuses a known ingredient by name, ignoring case, and never adds it twice', () => {
    let state = planned();
    const garlic = state.ingredients.find((i) => i.name === 'Garlic')!;
    const count = state.ingredients.length;
    state = reducer(state, { type: 'addToPantry', name: 'garlic' });
    state = reducer(state, { type: 'addToPantry', name: 'GARLIC' });
    expect(state.ingredients).toHaveLength(count);
    expect(state.pantry.filter((id) => id === garlic.id)).toHaveLength(1);
  });

  it('moves plan lines for pantry things to "already at home", and back when you need them', () => {
    let state = planned();
    const garlic = state.ingredients.find((i) => i.name === 'Garlic')!;
    state = reducer(state, { type: 'addToPantry', name: 'Garlic' });
    let split = splitByPantry(state.list, state.pantry);
    expect(split.atHome.map((i) => i.name)).toEqual(['Garlic']);
    expect(split.toGet.some((i) => i.name === 'Garlic')).toBe(false);

    // Updating from the plan doesn't bring it back.
    state = reducer(state, { type: 'generateList', range: fortnight });
    split = splitByPantry(state.list, state.pantry);
    expect(split.atHome.map((i) => i.name)).toEqual(['Garlic']);

    // "Need it" takes it out of the pantry, and the line is on the list again.
    state = reducer(state, { type: 'togglePantry', ingredientId: garlic.id });
    split = splitByPantry(state.list, state.pantry);
    expect(split.atHome).toHaveLength(0);
    expect(split.toGet.some((i) => i.name === 'Garlic')).toBe(true);
  });

  it('"We have this" on a plan line puts its ingredient in the pantry', () => {
    let state = planned();
    const onion = state.list.find((i) => i.name === 'Brown onion')!;
    state = reducer(state, { type: 'pantryFromItem', id: onion.id });
    expect(splitByPantry(state.list, state.pantry).atHome.map((i) => i.id)).toEqual([onion.id]);
  });

  it('keeps lines typed in by hand on the list, and "We have this" removes them', () => {
    let state = planned();
    state = reducer(state, { type: 'addToPantry', name: 'Garlic' });
    state = reducer(state, { type: 'addItem', name: 'Garlic' });
    const typed = state.list.find((i) => !i.key && i.name === 'Garlic')!;
    expect(splitByPantry(state.list, state.pantry).toGet).toContain(typed);

    state = reducer(state, { type: 'addItem', name: 'Sweetcorn' });
    const corn = state.list.find((i) => i.name === 'Sweetcorn')!;
    state = reducer(state, { type: 'pantryFromItem', id: corn.id });
    expect(state.list.some((i) => i.id === corn.id)).toBe(false);
    expect(state.pantry).toContain(state.ingredients.find((i) => i.name === 'Sweetcorn')!.id);
  });

  it('puts sweetcorn and baby corn with fruit and veg', () => {
    expect(guessAisle('sweetcorn')).toBe('produce');
    expect(guessAisle('sweet corn kernels')).toBe('produce');
    expect(guessAisle('baby corn')).toBe('produce');
  });
});
