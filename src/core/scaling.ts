/**
 * Recipe scaling: by servings, by a plain multiplier, or by the ingredient
 * you are short of ("I only have 3/4 cup of milk").
 */
import { formatDecimal, formatFraction } from './fractions';
import type { Ingredient, Recipe, RecipeIngredient } from './types';
import {
  convert,
  convertForSystem,
  dimensionOf,
  parseUnit,
  unitLabel,
  type KnownUnit,
  type UnitOptions,
  type UnitSystem,
} from './units';

export function factorForServings(recipe: Recipe, targetServings: number): number {
  if (recipe.servings <= 0) return 1;
  return targetServings / recipe.servings;
}

/** What the cook has of one ingredient in the recipe, by its position in the ingredient list. */
export interface Available {
  index: number;
  quantity: number;
  unit: string | null;
}

export interface LimitingResult {
  factor: number;
  /** Index of the ingredient that limits the recipe. */
  limitingIndex: number;
  /** Indexes whose amounts could not be compared (unit mismatch with no density). */
  skipped: number[];
}

/**
 * Work out how far the recipe can be scaled given what you have. With
 * several ingredients entered, the smallest ratio wins. Works both ways:
 * having more than the recipe needs gives a factor above 1.
 */
export function limitingFactor(
  recipe: Recipe,
  available: Available[],
  catalog: Map<string, Ingredient> = new Map(),
  opts: UnitOptions = {},
): LimitingResult | null {
  let best: { factor: number; index: number } | null = null;
  const skipped: number[] = [];
  for (const have of available) {
    const item = recipe.ingredients[have.index];
    if (!item || !item.scalable || item.quantity == null || item.quantity <= 0) {
      skipped.push(have.index);
      continue;
    }
    const inRecipeUnit = amountInUnit(have.quantity, have.unit, item.unit, catalog.get(item.ingredientId), opts);
    if (inRecipeUnit == null) {
      skipped.push(have.index);
      continue;
    }
    const factor = inRecipeUnit / item.quantity;
    if (!best || factor < best.factor) best = { factor, index: have.index };
  }
  return best ? { factor: best.factor, limitingIndex: best.index, skipped } : null;
}

/** Convert `quantity fromUnit` into `toUnit`. Free-text units only match themselves. */
function amountInUnit(
  quantity: number,
  fromUnit: string | null,
  toUnit: string | null,
  ingredient: Ingredient | undefined,
  opts: UnitOptions,
): number | null {
  const from = parseUnit(fromUnit);
  const to = parseUnit(toUnit);
  if (from && to) return convert(quantity, from, to, { ...opts, density: ingredient?.density });
  const a = (fromUnit ?? '').trim().toLowerCase().replace(/s$/, '');
  const b = (toUnit ?? '').trim().toLowerCase().replace(/s$/, '');
  return a === b ? quantity : null;
}

export interface ScaledIngredient extends RecipeIngredient {
  /** Quantity after scaling, or null for "to taste" items. */
  scaledQuantity: number | null;
  /** True for countable things (eggs, cans) that came out as a fraction. */
  partialCount: boolean;
}

export function scaleIngredients(recipe: Recipe, factor: number): ScaledIngredient[] {
  return recipe.ingredients.map((item) => {
    const scaledQuantity =
      item.quantity == null ? null : item.scalable ? item.quantity * factor : item.quantity;
    return {
      ...item,
      scaledQuantity,
      partialCount: scaledQuantity != null && isCountUnit(item.unit) && !isNearInteger(scaledQuantity),
    };
  });
}

function isCountUnit(unit: string | null): boolean {
  const known = parseUnit(unit);
  if (known) return dimensionOf(known) === 'count';
  return true; // "clove", "can", "egg": things you count
}

function isNearInteger(n: number): boolean {
  return Math.abs(n - Math.round(n)) < 0.05;
}

const FRACTION_UNITS: ReadonlySet<KnownUnit> = new Set(['tsp', 'tbsp', 'cup', 'oz', 'lb', 'floz', 'pint', 'quart', 'piece']);

export interface DisplayAmount {
  quantity: string;
  unit: string;
}

/**
 * Format an amount for display in the chosen unit system, e.g.
 * (0.75, "cup", metric) -> { quantity: "3/4", unit: "cup" },
 * (250, "g", imperial)  -> { quantity: "8.82", unit: "oz" }.
 */
export function formatAmount(
  quantity: number,
  unit: string | null,
  system: UnitSystem,
  opts: UnitOptions = {},
): DisplayAmount {
  const known = parseUnit(unit);
  if (!known) {
    return { quantity: formatFraction(quantity), unit: unit ?? '' };
  }
  const shown = convertForSystem(quantity, known, system, opts);
  const q = FRACTION_UNITS.has(shown.unit)
    ? formatFraction(shown.quantity)
    : shown.quantity >= 10
      ? String(Math.round(shown.quantity))
      : formatDecimal(shown.quantity);
  return { quantity: q, unit: unitLabel(shown.unit, shown.quantity) };
}
