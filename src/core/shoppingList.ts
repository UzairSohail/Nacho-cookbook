/**
 * Shopping list generation from the meal plan, and merging a regenerated
 * list with the edits people have already made to it.
 */
import { inRange, type DateRange } from './planner';
import type { Aisle, Ingredient, PlanEntry, Recipe } from './types';
import { AISLE_LABELS, AISLE_ORDER } from './types';
import { bestUnit, dimensionOf, parseUnit, toBase, type KnownUnit, type UnitOptions, type UnitSystem } from './units';

export interface GeneratedItem {
  /** Stable identity used to match items between regenerations. */
  key: string;
  ingredientId: string;
  name: string;
  aisle: Aisle;
  /** Null for "to taste" items with no amount. */
  quantity: number | null;
  /** A known unit, or the free-text unit as written ("clove"). Null for counts. */
  unit: KnownUnit | string | null;
  /** True when every recipe that needs it marks it optional. */
  optional: boolean;
  /** Titles of the recipes that need it. */
  sources: string[];
}

export interface GenerateOptions extends UnitOptions {
  entries: PlanEntry[];
  recipes: Map<string, Recipe>;
  catalog: Map<string, Ingredient>;
  range: DateRange;
  system: UnitSystem;
}

export interface GeneratedList {
  /** Everything the planned meals need, pantry staples included, by aisle then name. */
  items: GeneratedItem[];
}

interface Bucket {
  ingredientId: string;
  /** 'mass' / 'volume' / 'count' for known units, otherwise "free:<unit>", or "none" for to-taste. */
  kind: string;
  /** Base units (g, ml, pieces) for known units; raw quantity for free-text units. */
  total: number;
  freeUnit: string | null;
  optional: boolean;
  sources: Set<string>;
}

/**
 * Build the shopping list for the plan entries in `range`.
 *
 * Servings are added up per recipe first, so a 3-serving recipe planned for
 * one person on three days is bought once (factor 1), not three times.
 */
export function generateShoppingList(opts: GenerateOptions): GeneratedList {
  const servingsByRecipe = new Map<string, number>();
  for (const e of opts.entries) {
    if (!e.recipeId || !inRange(e.date, opts.range) || e.servings <= 0) continue;
    servingsByRecipe.set(e.recipeId, (servingsByRecipe.get(e.recipeId) ?? 0) + e.servings);
  }

  const buckets = new Map<string, Bucket>();
  const add = (b: Omit<Bucket, 'sources'> & { source: string }) => {
    const id = `${b.ingredientId}|${b.kind}`;
    const existing = buckets.get(id);
    if (existing) {
      existing.total += b.total;
      existing.optional = existing.optional && b.optional;
      existing.sources.add(b.source);
    } else {
      buckets.set(id, { ...b, sources: new Set([b.source]) });
    }
  };

  for (const [recipeId, servings] of servingsByRecipe) {
    const recipe = opts.recipes.get(recipeId);
    if (!recipe) continue;
    const factor = recipe.servings > 0 ? servings / recipe.servings : 1;
    for (const item of recipe.ingredients) {
      const ingredient = opts.catalog.get(item.ingredientId);
      const base = { ingredientId: item.ingredientId, optional: !!item.optional, source: recipe.title };
      if (item.quantity == null) {
        add({ ...base, kind: 'none', total: 0, freeUnit: null });
        continue;
      }
      const qty = item.scalable ? item.quantity * factor : item.quantity;
      const known = parseUnit(item.unit);
      if (!known) {
        const free = (item.unit ?? '').trim().toLowerCase();
        add({ ...base, kind: `free:${free}`, total: qty, freeUnit: item.unit });
        continue;
      }
      let dimension = dimensionOf(known);
      // Cups and spoons are measured with the recipe's own standard (e.g. US cups).
      let total = toBase(qty, known, { standard: recipe.measureStandard ?? opts.standard });
      if (dimension === 'volume' && ingredient?.density) {
        // Buy by weight when we know the density, so "1 cup flour" merges with "200 g flour".
        total *= ingredient.density;
        dimension = 'mass';
      }
      add({ ...base, kind: dimension, total, freeUnit: null });
    }
  }

  // An ingredient that is bought by amount doesn't also need a "to taste" line.
  const hasAmount = new Set(
    [...buckets.values()].filter((b) => b.kind !== 'none').map((b) => b.ingredientId),
  );

  const items: GeneratedItem[] = [];
  for (const b of buckets.values()) {
    if (b.kind === 'none' && hasAmount.has(b.ingredientId)) continue;
    const ingredient = opts.catalog.get(b.ingredientId);
    let quantity: number | null = null;
    let unit: string | null = null;
    if (b.kind === 'mass' || b.kind === 'volume' || b.kind === 'count') {
      const best = bestUnit(b.total, b.kind, opts.system, opts);
      quantity = best.quantity;
      unit = best.unit === 'piece' ? null : best.unit;
    } else if (b.kind.startsWith('free:')) {
      quantity = b.total;
      unit = b.freeUnit;
    }
    const generated: GeneratedItem = {
      key: `${b.ingredientId}|${b.kind}`,
      ingredientId: b.ingredientId,
      name: ingredient?.name ?? b.ingredientId,
      aisle: ingredient?.aisle ?? 'other',
      quantity,
      unit,
      optional: b.optional,
      sources: [...b.sources].sort(),
    };
    items.push(generated);
  }

  items.sort((a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.name.localeCompare(b.name));
  return { items };
}

/** A line on the saved shopping list, as people see and edit it. */
export interface ListItem {
  id: string;
  /** Set for generated lines; undefined for lines added by hand. */
  key?: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: Aisle;
  checked: boolean;
  /** True once someone has changed a generated line by hand. */
  edited: boolean;
  sources: string[];
}

/**
 * Merge a freshly generated list into the current one:
 * - lines added by hand are kept as they are;
 * - generated lines get new amounts, unless someone edited them;
 * - ticks are kept;
 * - generated lines that are no longer needed are dropped, unless edited;
 * - lines someone deleted (their keys in `dismissedKeys`) stay deleted.
 */
export function reconcileList(
  current: ListItem[],
  generated: GeneratedItem[],
  dismissedKeys: Set<string>,
  newId: () => string,
): ListItem[] {
  const fresh = new Map(generated.map((g) => [g.key, g]));
  const result: ListItem[] = [];
  const seen = new Set<string>();

  for (const item of current) {
    if (!item.key) {
      result.push(item);
      continue;
    }
    const g = fresh.get(item.key);
    seen.add(item.key);
    if (!g) {
      if (item.edited) result.push(item);
      continue;
    }
    result.push(
      item.edited
        ? { ...item, sources: g.sources }
        : { ...item, name: g.name, quantity: g.quantity, unit: g.unit, aisle: g.aisle, sources: g.sources },
    );
  }

  for (const g of generated) {
    if (seen.has(g.key) || dismissedKeys.has(g.key)) continue;
    result.push({
      id: newId(),
      key: g.key,
      name: g.name,
      quantity: g.quantity,
      unit: g.unit,
      aisle: g.aisle,
      checked: false,
      edited: false,
      sources: g.sources,
    });
  }
  return result;
}

/** Plain-text version of the list for sharing to WhatsApp, Notes, etc. */
export function listToText(
  items: ListItem[],
  formatQuantity: (q: number, unit: string | null) => string,
  title = 'Shopping list',
): string {
  const lines = [title];
  let aisle: Aisle | null = null;
  const sorted = [...items]
    .filter((i) => !i.checked)
    .sort((a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.name.localeCompare(b.name));
  for (const item of sorted) {
    if (item.aisle !== aisle) {
      aisle = item.aisle;
      lines.push('', AISLE_LABELS[aisle] ?? 'Other');
    }
    const amount = item.quantity == null ? '' : `${formatQuantity(item.quantity, item.unit)} `;
    lines.push(`- ${amount}${item.name}`);
  }
  return lines.join('\n');
}
