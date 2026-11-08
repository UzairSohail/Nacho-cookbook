/**
 * Fortnight planner logic: dates, and grouping planned meals into cooking
 * batches so a recipe that feeds several days is only cooked (and bought)
 * once.
 */
import type { PlanEntry, Recipe } from './types';

/** Leftovers keep this many days when a recipe doesn't say. */
export const DEFAULT_KEEPS_FOR_DAYS = 3;

/** Parse YYYY-MM-DD as a UTC date so day maths ignores time zones and DST. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Today's date (YYYY-MM-DD) on this device's clock. Not UTC: in an Australian
 * morning the UTC date is still yesterday, which would show the wrong week.
 */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

/** The Monday on or before the given date. */
export function mondayOf(iso: string): string {
  const day = parseDate(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

/** The 14 dates of the fortnight that starts on the Monday on or before `iso`. */
export function fortnightDates(iso: string): string[] {
  const start = mondayOf(iso);
  return Array.from({ length: 14 }, (_, i) => addDays(start, i));
}

export interface DateRange {
  /** Inclusive, YYYY-MM-DD. */
  start: string;
  /** Inclusive, YYYY-MM-DD. */
  end: string;
}

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

const SLOT_ORDER = { breakfast: 0, lunch: 1, dinner: 2, dessert: 3 } as const;

export interface Batch {
  recipeId: string;
  /** The entry where the batch is cooked. */
  cookEntryId: string;
  entryIds: string[];
  /** Servings eaten across the batch. */
  servings: number;
  /** Multiplier to apply to the recipe when cooking this batch. */
  factor: number;
}

/**
 * Group plan entries into cooking batches. Entries for the same recipe join
 * the current batch while they fall within the recipe's keeps-for window
 * from the cook day (days don't need to be next to each other). Each batch is
 * cooked once, scaled to exactly the servings it feeds.
 */
export function buildBatches(entries: PlanEntry[], recipes: Map<string, Recipe>): Batch[] {
  const byRecipe = new Map<string, PlanEntry[]>();
  for (const e of entries) {
    if (!e.recipeId || !recipes.has(e.recipeId) || e.servings <= 0) continue;
    const list = byRecipe.get(e.recipeId) ?? [];
    list.push(e);
    byRecipe.set(e.recipeId, list);
  }

  const batches: Batch[] = [];
  for (const [recipeId, list] of byRecipe) {
    const recipe = recipes.get(recipeId)!;
    const keeps = recipe.keepsForDays ?? DEFAULT_KEEPS_FOR_DAYS;
    list.sort((a, b) => a.date.localeCompare(b.date) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
    let current: Batch | null = null;
    let startDate = '';
    for (const e of list) {
      if (current && daysBetween(startDate, e.date) <= keeps) {
        current.entryIds.push(e.id);
        current.servings += e.servings;
      } else {
        current = { recipeId, cookEntryId: e.id, entryIds: [e.id], servings: e.servings, factor: 0 };
        startDate = e.date;
        batches.push(current);
      }
    }
  }
  for (const b of batches) {
    const servings = recipes.get(b.recipeId)!.servings;
    b.factor = servings > 0 ? b.servings / servings : 1;
  }
  return batches;
}

export type EntryRole = { kind: 'cook'; batch: Batch } | { kind: 'leftovers'; batch: Batch };

/** Label each planned entry as the cooking day or a leftovers day. */
export function entryRoles(batches: Batch[]): Map<string, EntryRole> {
  const roles = new Map<string, EntryRole>();
  for (const batch of batches) {
    for (const id of batch.entryIds) {
      roles.set(id, { kind: id === batch.cookEntryId ? 'cook' : 'leftovers', batch });
    }
  }
  return roles;
}
