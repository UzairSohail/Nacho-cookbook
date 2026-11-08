/**
 * Every change the app makes, as a pure function from the old state to the new
 * one. The demo store keeps the result in memory; the synced store writes the
 * difference to the offline database (see diff.ts).
 */
import {
  generateShoppingList,
  reconcileList,
  stableUuid,
  uuid,
  type DateRange,
  type GeneratedItem,
  type Ingredient,
  type ListItem,
  type MealSlot,
  type MeasureStandard,
  type PlanEntry,
  type Recipe,
  type UnitSystem,
} from '@/src/core';
import { samplePantry, sampleIngredients, sampleRecipes } from './sampleData';

export interface Settings {
  householdSize: number;
  system: UnitSystem;
  standard: MeasureStandard;
}

export interface State {
  householdId: string;
  settings: Settings;
  recipes: Recipe[];
  ingredients: Ingredient[];
  plan: PlanEntry[];
  /** Ingredient ids of pantry staples. */
  pantry: string[];
  list: ListItem[];
  dismissedKeys: string[];
  /** Pantry staples left off the last generated list. Kept on this device only. */
  skippedPantry: GeneratedItem[];
}

export type Action =
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'togglePantry'; ingredientId: string }
  | { type: 'setMeal'; date: string; slot: MealSlot; recipeId: string | null; servings?: number }
  | { type: 'setMealServings'; entryId: string; servings: number }
  | { type: 'generateList'; range: DateRange }
  | { type: 'toggleItem'; id: string }
  | { type: 'editItem'; id: string; patch: Pick<ListItem, 'name' | 'quantity' | 'unit'> }
  | { type: 'addItem'; name: string }
  | { type: 'deleteItem'; id: string }
  | { type: 'clearChecked' }
  | { type: 'addSampleRecipes' };

/** The one plan row for a household's meal slot on a day. */
export const planEntryId = (householdId: string, date: string, slot: MealSlot) =>
  stableUuid(householdId, 'plan', date, slot);

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'togglePantry': {
      const has = state.pantry.includes(action.ingredientId);
      return {
        ...state,
        pantry: has ? state.pantry.filter((id) => id !== action.ingredientId) : [...state.pantry, action.ingredientId],
      };
    }
    case 'setMeal': {
      const others = state.plan.filter((e) => !(e.date === action.date && e.slot === action.slot));
      if (!action.recipeId) return { ...state, plan: others };
      const entry: PlanEntry = {
        id: planEntryId(state.householdId, action.date, action.slot),
        date: action.date,
        slot: action.slot,
        recipeId: action.recipeId,
        servings: action.servings ?? state.settings.householdSize,
      };
      return { ...state, plan: [...others, entry] };
    }
    case 'setMealServings':
      return {
        ...state,
        plan: state.plan.map((e) => (e.id === action.entryId ? { ...e, servings: Math.max(1, action.servings) } : e)),
      };
    case 'generateList': {
      const { items, skippedPantry } = generateShoppingList({
        entries: state.plan,
        recipes: new Map(state.recipes.map((r) => [r.id, r])),
        catalog: new Map(state.ingredients.map((i) => [i.id, i])),
        pantryStapleIds: new Set(state.pantry),
        range: action.range,
        system: state.settings.system,
        standard: state.settings.standard,
      });
      return {
        ...state,
        list: reconcileList(state.list, items, new Set(state.dismissedKeys), uuid),
        skippedPantry,
      };
    }
    case 'toggleItem':
      return { ...state, list: state.list.map((i) => (i.id === action.id ? { ...i, checked: !i.checked } : i)) };
    case 'editItem':
      return {
        ...state,
        list: state.list.map((i) => (i.id === action.id ? { ...i, ...action.patch, edited: true } : i)),
      };
    case 'addItem': {
      const name = action.name.trim();
      if (!name) return state;
      const item: ListItem = {
        id: uuid(), name, quantity: null, unit: null, aisle: 'other', checked: false, edited: false, sources: [],
      };
      return { ...state, list: [...state.list, item] };
    }
    case 'deleteItem': {
      const item = state.list.find((i) => i.id === action.id);
      return {
        ...state,
        list: state.list.filter((i) => i.id !== action.id),
        dismissedKeys:
          item?.key && !state.dismissedKeys.includes(item.key) ? [...state.dismissedKeys, item.key] : state.dismissedKeys,
      };
    }
    case 'clearChecked':
      return { ...state, list: state.list.filter((i) => !i.checked) };
    case 'addSampleRecipes':
      return withSampleRecipes(state);
  }
}

/**
 * Adds the starter recipes, reusing ingredients the household already has by
 * name. Ids are derived from the household, so two people pressing the button
 * at once add the same rows rather than duplicates.
 */
export function withSampleRecipes(state: State): State {
  const byName = new Map(state.ingredients.map((i) => [i.name.toLowerCase(), i.id]));
  const idMap = new Map<string, string>();
  const ingredients = [...state.ingredients];
  for (const i of sampleIngredients) {
    const existing = byName.get(i.name.toLowerCase());
    if (existing) {
      idMap.set(i.id, existing);
    } else {
      const id = stableUuid(state.householdId, 'sample-ingredient', i.id);
      idMap.set(i.id, id);
      ingredients.push({ ...i, id });
    }
  }
  const have = new Set(state.recipes.map((r) => r.id));
  const recipes = [...state.recipes];
  for (const r of sampleRecipes) {
    const id = stableUuid(state.householdId, 'sample-recipe', r.id);
    if (have.has(id)) continue;
    recipes.push({
      ...r,
      id,
      ingredients: r.ingredients.map((ri) => ({ ...ri, ingredientId: idMap.get(ri.ingredientId)! })),
    });
  }
  const pantry = [...state.pantry];
  for (const p of samplePantry) {
    const id = idMap.get(p)!;
    if (!pantry.includes(id)) pantry.push(id);
  }
  return { ...state, ingredients, recipes, pantry };
}
