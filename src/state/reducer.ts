/**
 * Every change the app makes, as a pure function from the old state to the new
 * one. The demo store keeps the result in memory; the synced store writes the
 * difference to the offline database (see diff.ts).
 */
import {
  type Aisle,
  freePlanSlot,
  generateShoppingList,
  guessAisle,
  plannedRecipes,
  reconcileList,
  stableUuid,
  uuid,
  type DateRange,
  type Ingredient,
  type ListItem,
  type PricePick,
  type Product,
  type StoreId,
  type MealSlot,
  type MeasureStandard,
  type PlanEntry,
  type Recipe,
  type RecipeIngredient,
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
}

/** A recipe as the editor saves it: ingredients by name, not by catalog id. */
export type RecipeInput = Omit<Recipe, 'ingredients'> & {
  ingredients: Array<Omit<RecipeIngredient, 'ingredientId'> & { name: string }>;
};

export type Action =
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'togglePantry'; ingredientId: string }
  | { type: 'setMeal'; date: string; slot: MealSlot; recipeId: string | null; servings?: number }
  | { type: 'setMealServings'; entryId: string; servings: number }
  /** Planner: put a recipe on the list for a week or fortnight, then refresh the shopping list for it. */
  | { type: 'planRecipe'; range: DateRange; recipeId: string; servings?: number }
  | { type: 'unplanRecipe'; range: DateRange; recipeId: string }
  | { type: 'setPlannedServings'; range: DateRange; recipeId: string; servings: number }
  | { type: 'generateList'; range: DateRange }
  | { type: 'toggleItem'; id: string }
  | { type: 'editItem'; id: string; patch: Pick<ListItem, 'name' | 'quantity' | 'unit'> }
  | { type: 'setItemAisle'; id: string; aisle: Aisle }
  | { type: 'addItem'; name: string }
  /** Shopping list prices: use this product at this store (and buy it there). */
  | { type: 'pickProduct'; id: string; store: StoreId; product: Product }
  /** Shopping list prices: buy it at this store, or null for whichever is cheaper. */
  | { type: 'pickStore'; id: string; store: StoreId | null }
  /** Shopping list prices: buy every line at whichever store is cheaper for it (keeps picked products). */
  | { type: 'useCheapestStores' }
  /** Shopping list prices: forget the picks and go back to the automatic suggestion. */
  | { type: 'clearPricePick'; id: string }
  | { type: 'deleteItem'; id: string }
  | { type: 'clearChecked' }
  | { type: 'addSampleRecipes' }
  | { type: 'saveRecipe'; recipe: RecipeInput }
  | { type: 'deleteRecipe'; id: string };

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
    case 'planRecipe': {
      if (plannedRecipes(state.plan, action.range).some((p) => p.recipeId === action.recipeId)) return state;
      const at = freePlanSlot(state.plan, action.range);
      if (!at) return state;
      const entry: PlanEntry = {
        id: planEntryId(state.householdId, at.date, at.slot),
        date: at.date,
        slot: at.slot,
        recipeId: action.recipeId,
        servings: Math.max(1, action.servings ?? state.settings.householdSize),
      };
      return withListFor({ ...state, plan: [...state.plan, entry] }, action.range);
    }
    case 'unplanRecipe': {
      const planned = plannedRecipes(state.plan, action.range).find((p) => p.recipeId === action.recipeId);
      if (!planned) return state;
      const ids = new Set(planned.entryIds);
      return withListFor({ ...state, plan: state.plan.filter((e) => !ids.has(e.id)) }, action.range);
    }
    case 'setPlannedServings': {
      const planned = plannedRecipes(state.plan, action.range).find((p) => p.recipeId === action.recipeId);
      if (!planned) return state;
      // Older plans can have the recipe on several days: keep one row with the new total.
      const [keep, ...rest] = planned.entryIds;
      const drop = new Set(rest);
      const servings = Math.max(1, action.servings);
      const plan = state.plan.filter((e) => !drop.has(e.id)).map((e) => (e.id === keep ? { ...e, servings } : e));
      return withListFor({ ...state, plan }, action.range);
    }
    case 'generateList':
      return withListFor(state, action.range);
    case 'toggleItem':
      return { ...state, list: state.list.map((i) => (i.id === action.id ? { ...i, checked: !i.checked } : i)) };
    case 'editItem':
      return {
        ...state,
        list: state.list.map((i) => (i.id === action.id ? { ...i, ...action.patch, edited: true } : i)),
      };
    case 'setItemAisle':
      return withItemAisle(state, action.id, action.aisle);
    case 'addItem': {
      const name = action.name.trim();
      if (!name) return state;
      const item: ListItem = {
        id: uuid(),
        name,
        quantity: null,
        unit: null,
        aisle: ingredientByName(state, name)?.aisle ?? guessAisle(name),
        checked: false,
        edited: false,
        sources: [],
      };
      return { ...state, list: [...state.list, item] };
    }
    case 'pickProduct':
      return withPricePick(state, action.id, (pick) => ({ ...pick, [action.store]: action.product, store: action.store }));
    case 'pickStore':
      return withPricePick(state, action.id, (pick) => {
        const next: PricePick = { ...pick };
        if (action.store) next.store = action.store;
        else delete next.store;
        return next;
      });
    case 'useCheapestStores': {
      // Only lines someone sent to a particular store change; the rest already follow the cheaper store.
      let next = state;
      for (const item of state.list) {
        const ing = item.key
          ? next.ingredients.find((i) => i.id === item.key!.split('|')[0])
          : ingredientByName(next, item.name);
        if (!ing?.pricePick?.store) continue;
        next = withPricePick(next, item.id, (pick) => {
          const rest = { ...pick };
          delete rest.store;
          return rest;
        });
      }
      return next;
    }
    case 'clearPricePick':
      return withPricePick(state, action.id, () => null);
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
    case 'saveRecipe':
      return withSavedRecipe(state, action.recipe);
    case 'deleteRecipe':
      return {
        ...state,
        recipes: state.recipes.filter((r) => r.id !== action.id),
        // Meals planned with it go too, as they would on the server.
        plan: state.plan.filter((e) => e.recipeId !== action.id),
      };
  }
}

/** Rebuilds the shopping list from the recipes planned in `range`, keeping hand-made changes. */
function withListFor(state: State, range: DateRange): State {
  const { items } = generateShoppingList({
    entries: state.plan,
    recipes: new Map(state.recipes.map((r) => [r.id, r])),
    catalog: new Map(state.ingredients.map((i) => [i.id, i])),
    range,
    system: state.settings.system,
    standard: state.settings.standard,
  });
  return { ...state, list: reconcileList(state.list, items, new Set(state.dismissedKeys), uuid) };
}

const ingredientByName = (state: State, name: string) => {
  const key = name.trim().toLowerCase();
  return state.ingredients.find((i) => i.name.trim().toLowerCase() === key);
};

/**
 * Moves a shopping list line to another aisle. When the line is a known
 * ingredient, the ingredient moves too, so every line for it (and every future
 * list) uses the new aisle. Moving doesn't count as editing the line, so its
 * amount still follows the plan.
 */
export function withItemAisle(state: State, id: string, aisle: Aisle): State {
  const item = state.list.find((i) => i.id === id);
  if (!item) return state;
  const ingredient = item.key
    ? state.ingredients.find((i) => i.id === item.key!.split('|')[0])
    : ingredientByName(state, item.name);
  if (!ingredient) {
    return { ...state, list: state.list.map((i) => (i.id === id ? { ...i, aisle } : i)) };
  }
  const sameIngredient = (i: ListItem) =>
    i.id === id ||
    (i.key ? i.key.split('|')[0] === ingredient.id : i.name.trim().toLowerCase() === ingredient.name.trim().toLowerCase());
  return {
    ...state,
    ingredients: state.ingredients.map((i) => (i.id === ingredient.id ? { ...i, aisle } : i)),
    list: state.list.map((i) => (sameIngredient(i) ? { ...i, aisle } : i)),
  };
}

/**
 * Changes the price pick of a shopping list line. Picks belong to the
 * ingredient, so they're shared by the household and used on later lists. A
 * line added by hand that isn't a known ingredient becomes one.
 */
export function withPricePick(state: State, id: string, change: (pick: PricePick) => PricePick | null): State {
  const item = state.list.find((i) => i.id === id);
  if (!item) return state;
  let ingredient = item.key
    ? state.ingredients.find((i) => i.id === item.key!.split('|')[0])
    : ingredientByName(state, item.name);
  let ingredients = state.ingredients;
  if (!ingredient) {
    ingredient = { id: ingredientIdForName(state.householdId, item.name), name: item.name.trim(), aisle: item.aisle, density: null };
    ingredients = [...ingredients, ingredient];
  }
  const next = change(ingredient.pricePick ?? {});
  const empty = !next || (!next.store && !next.woolies && !next.coles);
  const updated: Ingredient = { ...ingredient, pricePick: empty ? null : next };
  return { ...state, ingredients: ingredients.map((i) => (i.id === updated.id ? updated : i)) };
}

/** Id for an ingredient first added by name, the same on every device so two people adding "Garlic" offline share a row. */
export const ingredientIdForName = (householdId: string, name: string) =>
  stableUuid(householdId, 'ingredient', name.trim().toLowerCase());

/**
 * Adds or replaces a recipe. Ingredient names are matched to the household's
 * ingredients ignoring case; new ones are added with a guessed aisle.
 */
export function withSavedRecipe(state: State, input: RecipeInput): State {
  const byName = new Map(state.ingredients.map((i) => [i.name.trim().toLowerCase(), i.id]));
  const ids = new Set(state.ingredients.map((i) => i.id));
  const ingredients = [...state.ingredients];
  const resolve = (rawName: string) => {
    const name = rawName.trim();
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) return existing;
    const id = ingredientIdForName(state.householdId, name);
    if (!ids.has(id)) {
      ingredients.push({ id, name, aisle: guessAisle(name), density: null });
      ids.add(id);
    }
    byName.set(key, id);
    return id;
  };
  const recipe: Recipe = {
    ...input,
    ingredients: input.ingredients.map(({ name, ...rest }) => ({ ...rest, ingredientId: resolve(name) })),
  };
  const at = state.recipes.findIndex((r) => r.id === recipe.id);
  const recipes = at < 0 ? [...state.recipes, recipe] : state.recipes.map((r, i) => (i === at ? recipe : r));
  return { ...state, ingredients, recipes };
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
