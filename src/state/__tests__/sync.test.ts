import { describe, expect, it } from 'vitest';

import { toServerValues, isPermanentError, isAuthRejection, planUpload, type QueuedChange } from '@/src/backend/sync/upload';
import { reducer, withSampleRecipes, type State } from '../reducer';
import { diffState, rowsToState, type Row, type Rows, type TableName, type Write } from '../rows';
import { toSql } from '../sql';

const H = '11111111-1111-4111-8111-111111111111';

function empty(): State {
  return {
    householdId: H,
    settings: { householdSize: 2, system: 'metric', standard: 'metric' },
    recipes: [],
    ingredients: [],
    plan: [],
    pantry: [],
    list: [],
    dismissedKeys: [],
  };
}

/** Plays writes into an in-memory copy of the tables, like the device database. */
function apply(rows: Rows, writes: Write[]): Rows {
  const next = Object.fromEntries(Object.entries(rows).map(([t, list]) => [t, list.map((r) => ({ ...r }))])) as Rows;
  for (const w of writes) {
    const list = next[w.table];
    const i = list.findIndex((r) => r.id === w.id);
    if (w.op === 'insert') {
      expect(i, `insert of existing ${w.table} ${w.id}`).toBe(-1);
      list.push({ id: w.id, ...w.data });
    } else if (w.op === 'update') {
      expect(i).toBeGreaterThanOrEqual(0);
      list[i] = { ...list[i], ...w.data };
    } else {
      expect(i).toBeGreaterThanOrEqual(0);
      list.splice(i, 1);
    }
  }
  return next;
}

function emptyRows(): Rows {
  const tables: TableName[] = [
    'households', 'ingredients', 'recipes', 'recipe_ingredients', 'recipe_steps',
    'plan_entries', 'pantry_staples', 'shopping_items', 'shopping_dismissed',
  ];
  const rows = Object.fromEntries(tables.map((t) => [t, [] as Array<Row & { id: string }>])) as Rows;
  rows.households.push({ id: H, name: 'Our kitchen', household_size: 2, unit_system: 'metric', measure_standard: 'au' });
  return rows;
}

describe('syncing state through database rows', () => {
  it('round-trips sample recipes, a plan, the pantry and a shopping list', () => {
    let rows = emptyRows();
    let state = rowsToState(rows, H);
    expect(state).toEqual(empty());

    const step = (action: Parameters<typeof reducer>[1]) => {
      const next = reducer(state, action);
      rows = apply(rows, diffState(state, next));
      state = rowsToState(rows, H);
      return next;
    };

    const seeded = step({ type: 'addSampleRecipes' });
    expect(state.recipes).toHaveLength(seeded.recipes.length);
    expect(state.ingredients).toHaveLength(seeded.ingredients.length);
    // Reading back gives the same recipes the reducer made (order aside).
    const byId = new Map(state.recipes.map((r) => [r.id, r]));
    for (const r of seeded.recipes) {
      const back = byId.get(r.id)!;
      expect(back.title).toBe(r.title);
      expect(back.ingredients.map((i) => [i.ingredientId, i.quantity, i.unit, i.scalable])).toEqual(
        r.ingredients.map((i) => [i.ingredientId, i.quantity, i.unit, i.scalable]),
      );
      expect(back.steps.map((s) => s.text)).toEqual(r.steps.map((s) => s.text));
      expect(back.tags).toEqual(r.tags ?? []);
    }
    expect(new Set(state.pantry)).toEqual(new Set(seeded.pantry));

    const curry = state.recipes.find((r) => r.title.includes('curry'))!;
    step({ type: 'setMeal', date: '2026-11-09', slot: 'dinner', recipeId: curry.id });
    step({ type: 'setMeal', date: '2026-11-10', slot: 'dinner', recipeId: curry.id, servings: 3 });
    expect(state.plan).toHaveLength(2);

    // Replacing a meal updates the same row instead of adding a second one.
    const pancakes = state.recipes.find((r) => r.title.includes('pancakes'))!;
    step({ type: 'setMeal', date: '2026-11-10', slot: 'dinner', recipeId: pancakes.id, servings: 3 });
    expect(state.plan).toHaveLength(2);
    expect(state.plan.find((e) => e.date === '2026-11-10')!.recipeId).toBe(pancakes.id);

    step({ type: 'settings', patch: { householdSize: 4, system: 'imperial' } });
    expect(state.settings).toEqual({ householdSize: 4, system: 'imperial', standard: 'metric' });
    expect(rows.households[0].household_size).toBe(4);

    step({ type: 'generateList', range: { start: '2026-11-09', end: '2026-11-22' } });
    expect(state.list.length).toBeGreaterThan(3);

    const first = state.list[0];
    step({ type: 'toggleItem', id: first.id });
    expect(state.list.find((i) => i.id === first.id)!.checked).toBe(true);

    const second = state.list.find((i) => i.id !== first.id && i.key)!;
    step({ type: 'deleteItem', id: second.id });
    expect(state.dismissedKeys).toEqual([second.key]);
    // Regenerating keeps the deleted line away.
    step({ type: 'generateList', range: { start: '2026-11-09', end: '2026-11-22' } });
    expect(state.list.some((i) => i.key === second.key)).toBe(false);

    step({ type: 'addItem', name: 'Dish soap' });
    expect(state.list.some((i) => i.name === 'Dish soap' && !i.key)).toBe(true);

    step({ type: 'clearChecked' });
    expect(state.list.some((i) => i.checked)).toBe(false);

    step({ type: 'setMeal', date: '2026-11-09', slot: 'dinner', recipeId: null });
    expect(state.plan).toHaveLength(1);
  });

  it('writes nothing when nothing changed', () => {
    const s = withSampleRecipes(empty());
    expect(diffState(s, s)).toEqual([]);
    expect(diffState(s, { ...s, settings: { ...s.settings } })).toEqual([]);
  });

  it('adds sample recipes only once, even if pressed twice', () => {
    const once = withSampleRecipes(empty());
    const twice = withSampleRecipes(once);
    expect(diffState(once, twice)).toEqual([]);
  });

  it('writes parents before children and deletes children first', () => {
    const s = withSampleRecipes(empty());
    const writes = diffState(empty(), s);
    const firstChild = writes.findIndex((w) => w.table === 'recipe_ingredients');
    const lastIngredient = writes.map((w) => w.table).lastIndexOf('ingredients');
    const lastRecipe = writes.map((w) => w.table).lastIndexOf('recipes');
    expect(lastIngredient).toBeLessThan(firstChild);
    expect(lastRecipe).toBeLessThan(firstChild);

    const removed = diffState(s, empty());
    const tables = removed.map((w) => w.table);
    expect(tables.indexOf('recipe_ingredients')).toBeLessThan(tables.indexOf('recipes'));
    expect(tables.indexOf('recipes')).toBeLessThan(tables.indexOf('ingredients'));
  });
});

describe('SQL for the device database', () => {
  it('builds insert, update and delete statements', () => {
    expect(toSql({ op: 'insert', table: 'shopping_items', id: 'x', data: { name: 'Milk', checked: 0 } })).toEqual({
      sql: 'INSERT INTO shopping_items (id, name, checked) VALUES (?, ?, ?)',
      params: ['x', 'Milk', 0],
    });
    expect(toSql({ op: 'update', table: 'shopping_items', id: 'x', data: { checked: 1 } })).toEqual({
      sql: 'UPDATE shopping_items SET checked = ? WHERE id = ?',
      params: [1, 'x'],
    });
    expect(toSql({ op: 'delete', table: 'plan_entries', id: 'y' })).toEqual({
      sql: 'DELETE FROM plan_entries WHERE id = ?',
      params: ['y'],
    });
  });

  it('refuses odd column names', () => {
    expect(() => toSql({ op: 'update', table: 'recipes', id: 'x', data: { 'title; drop': 'a' } })).toThrow();
  });
});

describe('uploading to Supabase', () => {
  it('turns device values back into Postgres arrays and booleans', () => {
    expect(
      toServerValues('recipes', { title: 'Soup', tags: '["dinner","quick"]', photo_paths: '[]', favourite: 1, servings: 4, updated_at: 'x' }),
    ).toEqual({ title: 'Soup', tags: ['dinner', 'quick'], photo_paths: [], favourite: true, servings: 4 });
    expect(toServerValues('shopping_items', { checked: 0, edited: 1, sources: '["Curry"]' })).toEqual({
      checked: false,
      edited: true,
      sources: ['Curry'],
    });
  });

  it('knows which server errors are permanent', () => {
    expect(isPermanentError('23505')).toBe(true);
    expect(isPermanentError('42501')).toBe(true);
    expect(isPermanentError('22P02')).toBe(true);
    expect(isPermanentError('PGRST301')).toBe(false);
    expect(isPermanentError(undefined)).toBe(false);
  });
});

describe('isAuthRejection', () => {
  it('spots the sync server refusing a sign-in token', () => {
    const msg = 'HTTP Unauthorized: {"error":{"code":"PSYNC_S2105","status":401,"description":"Unexpected \\"aud\\" claim value"}}';
    expect(isAuthRejection(new Error(msg))).toBe(true);
  });
  it('ignores being offline', () => {
    expect(isAuthRejection(new Error('Failed to fetch'))).toBe(false);
    expect(isAuthRejection(undefined)).toBe(false);
  });
});

describe('planUpload', () => {
  const put = (table: string, id: string, opData: Record<string, unknown> = { household_id: H, name: id }): QueuedChange => ({
    op: 'PUT', table, id, opData,
  });

  it('sends back-to-back inserts into one table as one upsert', () => {
    const steps = planUpload([put('ingredients', 'a'), put('ingredients', 'b'), put('recipes', 'r', { household_id: H, title: 'x' })]);
    expect(steps.map((s) => s.kind)).toEqual(['upsert', 'upsert']);
    expect(steps[0].kind === 'upsert' && steps[0].rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps order around updates and deletes', () => {
    const steps = planUpload([
      put('shopping_items', 'a'),
      { op: 'PATCH', table: 'shopping_items', id: 'a', opData: { checked: 1 } },
      put('shopping_items', 'b'),
      { op: 'DELETE', table: 'shopping_items', id: 'a' },
    ]);
    expect(steps.map((s) => s.kind)).toEqual(['upsert', 'update', 'upsert', 'delete']);
    expect(steps[1].kind === 'update' && steps[1].values).toEqual({ checked: true });
  });

  it('starts a new batch when the same row comes again', () => {
    const steps = planUpload([
      put('recipes', 'a', { title: 'A' }),
      put('recipes', 'b', { title: 'B', notes: 'n' }),
      put('recipes', 'b', { title: 'B', notes: 'm' }),
    ]);
    expect(steps).toHaveLength(2);
  });
});
