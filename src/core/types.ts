/** Shared data types. These mirror the database tables in supabase/schema.sql. */

export type Aisle =
  | 'produce'
  | 'meat'
  | 'seafood'
  | 'dairy'
  | 'bakery'
  | 'pantry'
  | 'spices'
  | 'frozen'
  | 'drinks'
  | 'household'
  | 'other';

export const AISLE_ORDER: Aisle[] = [
  'produce', 'meat', 'seafood', 'dairy', 'bakery', 'pantry', 'spices', 'frozen', 'drinks', 'household', 'other',
];

/** A household-wide ingredient record, so lists can merge "plain flour" across recipes. */
export interface Ingredient {
  id: string;
  name: string;
  aisle: Aisle;
  /** Grams per millilitre, for volume <-> weight conversion. Null if unknown. */
  density?: number | null;
}

export interface RecipeIngredient {
  ingredientId: string;
  /** Null for "to taste" style items with no amount. */
  quantity: number | null;
  /** Free text unit as written ("cup", "g", "clove"). Null or "" means a count (2 eggs). */
  unit: string | null;
  note?: string;
  /** Optional heading such as "For the sauce". */
  group?: string;
  /** False for "to taste" items: they are never scaled. */
  scalable: boolean;
  optional?: boolean;
}

export interface RecipeStep {
  text: string;
  photoUrl?: string;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  /** How many servings the recipe makes as written. */
  servings: number;
  /** How many days cooked leftovers keep. Null means the default (see planner.ts). */
  keepsForDays?: number | null;
  prepMinutes?: number;
  cookMinutes?: number;
  photoUrls?: string[];
  tags?: string[];
  sourceUrl?: string;
  notes?: string;
  favourite?: boolean;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'dessert';
export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'dessert'];

export interface PlanEntry {
  id: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  slot: MealSlot;
  recipeId?: string;
  /** Free text instead of a recipe, e.g. "Eating out". */
  note?: string;
  /** Servings eaten in this slot. Defaults to the household size. */
  servings: number;
}

export interface PantryStaple {
  ingredientId: string;
}
