import { describe, expect, it } from 'vitest';

import { parsePricePick, type Product } from '@/src/core';
import { reducer, ingredientIdForName, withSampleRecipes, type State } from '../reducer';
import { diffState, ingredientRow, rowsToState, type Rows } from '../rows';

const H = '11111111-1111-4111-8111-111111111111';
const fortnight = { start: '2026-11-09', end: '2026-11-22' };
const flour: Product = { id: 'c1', name: 'Coles Simply Plain Flour', price: 2.4, size: 2000, unit: 'g' };

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

describe('shopping list price picks', () => {
  it('saves a picked product on the ingredient, as one update', () => {
    const before = planned();
    const onion = before.list.find((i) => i.name === 'Brown onion')!;
    const after = reducer(before, { type: 'pickProduct', id: onion.id, store: 'coles', product: flour });
    const ing = after.ingredients.find((i) => i.id === onion.key!.split('|')[0])!;
    expect(ing.pricePick).toEqual({ store: 'coles', coles: flour });
    const writes = diffState(before, after);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: 'update', table: 'ingredients', id: ing.id });
    expect(parsePricePick(writes[0].data!.price_pick)).toEqual({ store: 'coles', coles: flour });
  });

  it('switches store, back to cheapest, and clears', () => {
    let state = planned();
    const onion = state.list.find((i) => i.name === 'Brown onion')!;
    const ingOf = (s: State) => s.ingredients.find((i) => i.id === onion.key!.split('|')[0])!;
    state = reducer(state, { type: 'pickStore', id: onion.id, store: 'woolies' });
    expect(ingOf(state).pricePick).toEqual({ store: 'woolies' });
    state = reducer(state, { type: 'pickStore', id: onion.id, store: null });
    expect(ingOf(state).pricePick).toBeNull();
    state = reducer(state, { type: 'pickProduct', id: onion.id, store: 'coles', product: flour });
    const before = state;
    state = reducer(state, { type: 'clearPricePick', id: onion.id });
    expect(ingOf(state).pricePick).toBeNull();
    expect(diffState(before, state)).toEqual([
      { op: 'update', table: 'ingredients', id: ingOf(state).id, data: { price_pick: null } },
    ]);
  });

  it('turns a hand-added line into an ingredient so the pick is remembered', () => {
    let state = reducer(planned(), { type: 'addItem', name: 'Tim Tams' });
    const item = state.list.find((i) => i.name === 'Tim Tams')!;
    state = reducer(state, { type: 'pickStore', id: item.id, store: 'coles' });
    const ing = state.ingredients.find((i) => i.id === ingredientIdForName(H, 'Tim Tams'))!;
    expect(ing).toMatchObject({ name: 'Tim Tams', aisle: item.aisle, pricePick: { store: 'coles' } });
  });

  it('leaves the column out for ingredients nobody has priced', () => {
    const state = planned();
    expect('price_pick' in ingredientRow(state.ingredients[0], H)).toBe(false);
    const rows = { households: [], ingredients: [{ id: 'i1', household_id: H, name: 'Flour', aisle: 'pantry', price_pick: '{"store":"coles"}' }] } as unknown as Rows;
    for (const t of ['recipes', 'recipe_ingredients', 'recipe_steps', 'plan_entries', 'pantry_staples', 'shopping_items', 'shopping_dismissed'] as const) rows[t] = [];
    expect(rowsToState(rows, H).ingredients[0].pricePick).toEqual({ store: 'coles' });
  });
});
