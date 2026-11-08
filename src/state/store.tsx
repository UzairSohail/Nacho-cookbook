/**
 * App state for v1 development. This in-memory store is the seam where the
 * offline database (PowerSync + Supabase) plugs in next: screens only use the
 * hooks and actions below, so swapping the storage won't touch them.
 */
import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';

import {
  fortnightDates,
  generateShoppingList,
  reconcileList,
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
import { samplePantry, samplePlan, sampleIngredients, sampleRecipes } from './sampleData';

export interface Settings {
  householdSize: number;
  system: UnitSystem;
  standard: MeasureStandard;
}

export interface State {
  settings: Settings;
  recipes: Recipe[];
  ingredients: Ingredient[];
  plan: PlanEntry[];
  pantry: string[];
  list: ListItem[];
  dismissedKeys: string[];
  skippedPantry: GeneratedItem[];
}

type Action =
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'togglePantry'; ingredientId: string }
  | { type: 'setMeal'; date: string; slot: MealSlot; recipeId: string | null; servings?: number }
  | { type: 'setMealServings'; entryId: string; servings: number }
  | { type: 'generateList'; range: DateRange }
  | { type: 'toggleItem'; id: string }
  | { type: 'editItem'; id: string; patch: Pick<ListItem, 'name' | 'quantity' | 'unit'> }
  | { type: 'addItem'; name: string }
  | { type: 'deleteItem'; id: string }
  | { type: 'clearChecked' };

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

function reducer(state: State, action: Action): State {
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
        id: `${action.date}-${action.slot}`,
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
        list: reconcileList(state.list, items, new Set(state.dismissedKeys), newId),
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
        id: newId(), name, quantity: null, unit: null, aisle: 'other', checked: false, edited: false, sources: [],
      };
      return { ...state, list: [...state.list, item] };
    }
    case 'deleteItem': {
      const item = state.list.find((i) => i.id === action.id);
      return {
        ...state,
        list: state.list.filter((i) => i.id !== action.id),
        dismissedKeys: item?.key ? [...state.dismissedKeys, item.key] : state.dismissedKeys,
      };
    }
    case 'clearChecked':
      return { ...state, list: state.list.filter((i) => !i.checked) };
  }
}

function initialState(): State {
  const settings: Settings = { householdSize: 2, system: 'metric', standard: 'metric' };
  const today = new Date().toISOString().slice(0, 10);
  return {
    settings,
    recipes: sampleRecipes,
    ingredients: sampleIngredients,
    plan: samplePlan(fortnightDates(today), settings.householdSize),
    pantry: samplePantry,
    list: [],
    dismissedKeys: [],
    skippedPantry: [],
  };
}

const StoreContext = createContext<{ state: State; dispatch: (a: Action) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function useCatalog() {
  const { state } = useStore();
  return useMemo(() => new Map(state.ingredients.map((i) => [i.id, i])), [state.ingredients]);
}

export function useRecipeMap() {
  const { state } = useStore();
  return useMemo(() => new Map(state.recipes.map((r) => [r.id, r])), [state.recipes]);
}
