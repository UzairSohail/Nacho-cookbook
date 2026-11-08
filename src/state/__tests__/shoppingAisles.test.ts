import { describe, expect, it } from 'vitest';

import { reducer, withSampleRecipes, type Action, type State } from '../reducer';
import { diffState } from '../rows';

const H = '11111111-1111-4111-8111-111111111111';
const fortnight = { start: '2026-11-09', end: '2026-11-22' };

function planned(): State {
  let state: State = withSampleRecipes({
    householdId: H,
    settings: { householdSize: 2, system: 'metric', standard: 'au' },
    recipes: [], ingredients: [], plan: [], pantry: [], list: [], dismissedKeys: [],
  });
  const curry = state.recipes.find((r) => /curry/i.test(r.title))!;
  state = reducer(state, { type: 'setMeal', date: '2026-11-10', slot: 'dinner', recipeId: curry.id });
  return reducer(state, { type: 'generateList', range: fortnight });
}

describe('shopping list aisles', () => {
  it('puts items added by hand in a guessed aisle', () => {
    const state = reducer(planned(), { type: 'addItem', name: 'Dishwashing liquid' });
    expect(state.list.find((i) => i.name === 'Dishwashing liquid')!.aisle).toBe('household');
  });

  it('uses the household’s own aisle for a known ingredient added by hand', () => {
    let state = planned();
    const garlic = state.ingredients.find((i) => i.name === 'Garlic')!;
    state = { ...state, ingredients: state.ingredients.map((i) => (i.id === garlic.id ? { ...i, aisle: 'spices' } : i)) };
    state = reducer(state, { type: 'addItem', name: 'garlic' });
    expect(state.list.find((i) => i.name === 'garlic')!.aisle).toBe('spices');
  });

  it('moves a generated line and remembers the aisle for next time', () => {
    let state = planned();
    const onion = state.list.find((i) => i.name === 'Brown onion')!;
    expect(onion.aisle).toBe('produce');
    const before = state;
    state = reducer(state, { type: 'setItemAisle', id: onion.id, aisle: 'pantry' });

    const moved = state.list.find((i) => i.id === onion.id)!;
    expect(moved.aisle).toBe('pantry');
    // Moving isn't an edit, so amounts still follow the plan.
    expect(moved.edited).toBe(false);
    expect(state.ingredients.find((i) => i.name === 'Brown onion')!.aisle).toBe('pantry');

    // Both the list line and the ingredient sync.
    const writes = diffState(before, state);
    expect(writes.map((w) => w.table).sort()).toEqual(['ingredients', 'shopping_items']);

    // A fresh list keeps the new aisle.
    state = reducer({ ...state, list: [] }, { type: 'generateList', range: fortnight });
    expect(state.list.find((i) => i.name === 'Brown onion')!.aisle).toBe('pantry');
  });

  it('moves a hand-added line that isn’t a known ingredient on its own', () => {
    let state = reducer(planned(), { type: 'addItem', name: 'Birthday candles' });
    const item = state.list.find((i) => i.name === 'Birthday candles')!;
    const ingredients = state.ingredients;
    state = reducer(state, { type: 'setItemAisle', id: item.id, aisle: 'household' } satisfies Action);
    expect(state.list.find((i) => i.id === item.id)!.aisle).toBe('household');
    expect(state.ingredients).toBe(ingredients);
  });

  it('keeps ticks when the list is updated from the plan', () => {
    let state = planned();
    const first = state.list[0];
    state = reducer(state, { type: 'toggleItem', id: first.id });
    state = reducer(state, { type: 'generateList', range: fortnight });
    expect(state.list.find((i) => i.id === first.id)!.checked).toBe(true);
  });
});
