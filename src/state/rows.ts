/**
 * Converting between the app's types (src/core) and database rows, both ways,
 * and working out which rows a change touched.
 *
 * Rows use the column names in supabase/schema.sql. On the device they live in
 * SQLite, where booleans are 0/1 and arrays are JSON text.
 */
import {
  parsePricePick,
  pricePickText,
  stableUuid,
  type Aisle,
  type Ingredient,
  type ListItem,
  type MealSlot,
  type MeasureStandard,
  type PlanEntry,
  type Recipe,
  type UnitSystem,
} from '@/src/core';
import type { Settings, State } from './reducer';

export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export interface Write {
  op: 'insert' | 'update' | 'delete';
  table: TableName;
  id: string;
  /** Column values for insert and update (update lists only the changed columns). */
  data?: Row;
}

export type TableName =
  | 'households'
  | 'ingredients'
  | 'recipes'
  | 'recipe_ingredients'
  | 'recipe_steps'
  | 'plan_entries'
  | 'pantry_staples'
  | 'shopping_items'
  | 'shopping_dismissed';

/** Rows as read back from the local database. Every row has an id. */
export type Rows = { [T in TableName]: Array<Row & { id: string }> };

const bool = (b: boolean | undefined) => (b ? 1 : 0);
const opt = <T>(v: T | undefined | null): T | null => (v === undefined ? null : v);
const json = (a: string[] | undefined) => JSON.stringify(a ?? []);

const str = (v: SqlValue | undefined) => (v == null ? undefined : String(v));
const num = (v: SqlValue | undefined) => (v == null || v === '' ? undefined : Number(v));
const parseList = (v: SqlValue | undefined): string[] => {
  if (typeof v !== 'string' || !v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

// Ids for rows that only exist as part of something else.
export const recipeIngredientId = (recipeId: string, index: number) => stableUuid(recipeId, 'ingredient', String(index));
export const recipeStepId = (recipeId: string, index: number) => stableUuid(recipeId, 'step', String(index));
export const pantryId = (householdId: string, ingredientId: string) => stableUuid(householdId, 'pantry', ingredientId);
export const dismissedId = (householdId: string, key: string) => stableUuid(householdId, 'dismissed', key);

// ---- app types -> rows ----------------------------------------------------

export function settingsRow(s: Settings): Row {
  return { household_size: s.householdSize, unit_system: s.system, measure_standard: s.standard };
}

export function ingredientRow(i: Ingredient, householdId: string): Row {
  const row: Row = { household_id: householdId, name: i.name, aisle: i.aisle, density: opt(i.density) };
  // Only sent once someone has picked a product, so households that haven't
  // added the price_pick column yet (migration 004) keep syncing everything else.
  if (i.pricePick !== undefined) row.price_pick = pricePickText(i.pricePick);
  return row;
}

export function recipeRows(r: Recipe, householdId: string) {
  const recipe: Row = {
    household_id: householdId,
    title: r.title,
    description: opt(r.description),
    servings: r.servings,
    measure_standard: opt(r.measureStandard),
    keeps_for_days: opt(r.keepsForDays),
    prep_minutes: opt(r.prepMinutes),
    cook_minutes: opt(r.cookMinutes),
    photo_paths: json(r.photoUrls),
    tags: json(r.tags),
    source_url: opt(r.sourceUrl),
    notes: opt(r.notes),
    favourite: bool(r.favourite),
  };
  const ingredients = r.ingredients.map((ri, position) => ({
    id: recipeIngredientId(r.id, position),
    row: {
      household_id: householdId,
      recipe_id: r.id,
      position,
      ingredient_id: ri.ingredientId,
      quantity: ri.quantity,
      unit: ri.unit,
      note: opt(ri.note),
      group_name: opt(ri.group),
      scalable: bool(ri.scalable),
      optional: bool(ri.optional),
    } as Row,
  }));
  const steps = r.steps.map((s, position) => ({
    id: recipeStepId(r.id, position),
    row: {
      household_id: householdId,
      recipe_id: r.id,
      position,
      text: s.text,
      photo_path: opt(s.photoUrl),
    } as Row,
  }));
  return { recipe, ingredients, steps };
}

export function planRow(e: PlanEntry, householdId: string): Row {
  return {
    household_id: householdId,
    date: e.date,
    slot: e.slot,
    recipe_id: opt(e.recipeId),
    note: opt(e.note),
    servings: e.servings,
  };
}

export function listItemRow(i: ListItem, householdId: string): Row {
  return {
    household_id: householdId,
    key: opt(i.key),
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    aisle: i.aisle,
    checked: bool(i.checked),
    edited: bool(i.edited),
    sources: json(i.sources),
  };
}

// ---- rows -> app types ----------------------------------------------------

export function rowsToState(rows: Rows, householdId: string): State {
  const household = rows.households.find((h) => h.id === householdId);
  const settings: Settings = {
    householdSize: num(household?.household_size) ?? 2,
    system: (str(household?.unit_system) as UnitSystem) ?? 'metric',
    standard: (str(household?.measure_standard) as MeasureStandard) ?? 'au',
  };

  const byRecipe = <R extends Row>(list: R[]) => {
    const m = new Map<string, R[]>();
    for (const r of list) {
      const k = String(r.recipe_id);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    for (const v of m.values()) v.sort((a, b) => Number(a.position) - Number(b.position));
    return m;
  };
  const ingByRecipe = byRecipe(rows.recipe_ingredients);
  const stepsByRecipe = byRecipe(rows.recipe_steps);

  const recipes: Recipe[] = rows.recipes
    .map((r) => ({
      id: r.id,
      title: String(r.title ?? ''),
      description: str(r.description),
      servings: num(r.servings) ?? 1,
      measureStandard: (str(r.measure_standard) as MeasureStandard | undefined) ?? null,
      keepsForDays: num(r.keeps_for_days) ?? null,
      prepMinutes: num(r.prep_minutes),
      cookMinutes: num(r.cook_minutes),
      photoUrls: parseList(r.photo_paths),
      tags: parseList(r.tags),
      sourceUrl: str(r.source_url),
      notes: str(r.notes),
      favourite: Number(r.favourite) === 1,
      ingredients: (ingByRecipe.get(r.id) ?? []).map((ri) => ({
        ingredientId: String(ri.ingredient_id),
        quantity: num(ri.quantity) ?? null,
        unit: str(ri.unit) ?? null,
        note: str(ri.note),
        group: str(ri.group_name),
        scalable: Number(ri.scalable) === 1,
        optional: Number(ri.optional) === 1,
      })),
      steps: (stepsByRecipe.get(r.id) ?? []).map((s) => ({ text: String(s.text ?? ''), photoUrl: str(s.photo_path) })),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    householdId,
    settings,
    recipes,
    ingredients: rows.ingredients.map((i) => ({
      id: i.id,
      name: String(i.name ?? ''),
      aisle: (str(i.aisle) as Aisle) ?? 'other',
      density: num(i.density) ?? null,
      pricePick: parsePricePick(i.price_pick) ?? undefined,
    })),
    plan: rows.plan_entries.map((e) => ({
      id: e.id,
      date: String(e.date),
      slot: String(e.slot) as MealSlot,
      recipeId: str(e.recipe_id),
      note: str(e.note),
      servings: num(e.servings) ?? settings.householdSize,
    })),
    pantry: rows.pantry_staples.map((p) => String(p.ingredient_id)),
    list: rows.shopping_items.map((i) => ({
      id: i.id,
      key: str(i.key),
      name: String(i.name ?? ''),
      quantity: num(i.quantity) ?? null,
      unit: str(i.unit) ?? null,
      aisle: (str(i.aisle) as Aisle) ?? 'other',
      checked: Number(i.checked) === 1,
      edited: Number(i.edited) === 1,
      sources: parseList(i.sources),
    })),
    dismissedKeys: rows.shopping_dismissed.map((d) => String(d.key)),
  };
}

// ---- working out what changed ---------------------------------------------

type Keyed = Map<string, Row>;

function diffTable(table: TableName, before: Keyed, after: Keyed): Write[] {
  const writes: Write[] = [];
  for (const [id, row] of before) {
    if (!after.has(id)) writes.push({ op: 'delete', table, id });
  }
  for (const [id, row] of after) {
    const old = before.get(id);
    if (!old) {
      writes.push({ op: 'insert', table, id, data: row });
      continue;
    }
    const changed: Row = {};
    for (const k of Object.keys(row)) if (row[k] !== old[k]) changed[k] = row[k];
    if (Object.keys(changed).length) writes.push({ op: 'update', table, id, data: changed });
  }
  return writes;
}

function tables(state: State): Record<Exclude<TableName, 'households'>, Keyed> {
  const h = state.householdId;
  const recipes: Keyed = new Map();
  const recipeIngredients: Keyed = new Map();
  const recipeSteps: Keyed = new Map();
  for (const r of state.recipes) {
    const rows = recipeRows(r, h);
    recipes.set(r.id, rows.recipe);
    for (const ri of rows.ingredients) recipeIngredients.set(ri.id, ri.row);
    for (const s of rows.steps) recipeSteps.set(s.id, s.row);
  }
  return {
    ingredients: new Map(state.ingredients.map((i) => [i.id, ingredientRow(i, h)])),
    recipes,
    recipe_ingredients: recipeIngredients,
    recipe_steps: recipeSteps,
    plan_entries: new Map(state.plan.map((e) => [e.id, planRow(e, h)])),
    pantry_staples: new Map(state.pantry.map((id) => [pantryId(h, id), { household_id: h, ingredient_id: id }])),
    shopping_items: new Map(state.list.map((i) => [i.id, listItemRow(i, h)])),
    shopping_dismissed: new Map(state.dismissedKeys.map((k) => [dismissedId(h, k), { household_id: h, key: k }])),
  };
}

/**
 * The database writes that turn `before` into `after`. Parents are written
 * before children and children deleted before parents, so foreign keys hold
 * when the changes reach the server in order.
 */
export function diffState(before: State, after: State): Write[] {
  if (before === after) return [];
  const writes: Write[] = [];
  if (before.settings !== after.settings) {
    writes.push(
      ...diffTable(
        'households',
        new Map([[before.householdId, settingsRow(before.settings)]]),
        new Map([[after.householdId, settingsRow(after.settings)]]),
      ),
    );
  }
  const a = tables(before);
  const b = tables(after);
  const order: Array<Exclude<TableName, 'households'>> = [
    'ingredients', 'recipes', 'recipe_ingredients', 'recipe_steps', 'plan_entries',
    'pantry_staples', 'shopping_items', 'shopping_dismissed',
  ];
  const all = order.flatMap((t) => diffTable(t, a[t], b[t]));
  const rank = (t: TableName) => order.indexOf(t as (typeof order)[number]);
  // Inserts and updates parent-first, deletes child-first.
  writes.push(...all.filter((w) => w.op !== 'delete'));
  writes.push(...all.filter((w) => w.op === 'delete').sort((x, y) => rank(y.table) - rank(x.table)));
  return writes;
}
