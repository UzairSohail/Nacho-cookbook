/**
 * Turn a scaled amount into something a cook can actually measure.
 *
 * Scaling a recipe gives exact numbers (0.92 eggs, 1.875 cups, 1.25 tbsp).
 * Nobody owns a 7/8 cup measure or can crack 0.92 of an egg, so amounts are
 * rounded to the tools in a kitchen drawer:
 * - things you count round to whole ones, or halves and quarters when small
 *   (0.92 eggs -> 1, 1.4 onions -> 1 1/2)
 * - cups use the usual cup set (1/4, 1/3, 1/2, 2/3, 3/4); anything left over
 *   is topped up with spoons (1 7/8 cups -> 1 3/4 cups + 1 1/2 tbsp)
 * - spoons use tbsp, 1/2 tbsp and tsp down to 1/8 tsp
 *   (1 1/4 tbsp -> 1 tbsp + 1 tsp); tiny amounts become a pinch
 * - grams and millilitres round to what kitchen scales and jugs show
 *   (7.69 g -> 8 g, 153.8 g -> 155 g)
 *
 * The cook can also switch a recipe between cups and metric. Cups become
 * grams (or ml for liquids) and back when the ingredient's density is known
 * or can be guessed from its name; small amounts stay as spoons either way.
 */
import { formatDecimal, formatFraction } from './fractions';
import {
  convertForSystem,
  toBase,
  dimensionOf,
  isSpoonUnit,
  parseUnit,
  spoonSize,
  unitLabel,
  type MeasureStandard,
  type UnitSystem,
} from './units';
import type { MeasureOptions } from './scaling';

export interface KitchenAmount {
  /** What to show, e.g. "1 3/4 cups + 1 1/2 tbsp", "1", "155 g". */
  text: string;
  /** An optional tip shown under the ingredient, e.g. how to use half an egg. */
  note?: string;
}

/** How the recipe page shows amounts: in grams and ml, or in cups. */
export type MeasureView = 'metric' | 'cups';

export interface KitchenOptions extends MeasureOptions {
  /** The ingredient's name, used for tips like "beat 1 egg and use half" and to guess its density. */
  name?: string;
  /** Grams per ml, if the ingredient has one saved. */
  density?: number | null;
  /** Leave out to show the amount in the unit the recipe was written in. */
  view?: MeasureView;
}

export function kitchenAmount(
  quantity: number,
  unit: string | null,
  system: UnitSystem,
  opts: KitchenOptions = {},
): KitchenAmount {
  if (!Number.isFinite(quantity) || quantity <= 0) return { text: '' };
  const known = parseUnit(unit);
  if (!known || dimensionOf(known) === 'count') {
    // "clove", "can", "large", or no unit at all: things you count.
    const label = known === 'piece' ? '' : (unit ?? '').trim();
    return countAmount(quantity, label, opts.name);
  }

  const household: MeasureStandard = opts.standard ?? 'metric';
  const source: MeasureStandard = opts.sourceStandard ?? household;

  const view = opts.view;
  if (view) {
    const base = toBase(quantity, known, { standard: source }); // g or ml
    const volume = dimensionOf(known) === 'volume';
    const density = opts.density && opts.density > 0 ? opts.density : guessDensity(opts.name);
    const cupMl = spoonSize('cup', household);
    if (view === 'cups') {
      if (volume) return { text: cupText(base / cupMl, cupMl, household, '') };
      if (density) return { text: cupText(base / density / cupMl, cupMl, household, '') };
      return { text: metricText(base, 'mass') };
    }
    if (!volume) return { text: metricText(base, 'mass') };
    if (base < cupMl / 4 - 0.5) return { text: spoonText(base, household) };
    if (density && !isLiquid(opts.name)) return { text: metricText(base * density, 'mass') };
    return { text: metricText(base, 'volume') };
  }

  if (known === 'cup' && source !== household) {
    // Cups stay as written (they differ by ~5%); leftovers go in the household's spoons.
    return { text: cupText(quantity, spoonSize('cup', source), household, source === 'us' ? 'US ' : '') };
  }
  let q = quantity;
  if (isSpoonUnit(known) && source !== household) {
    q = (quantity * spoonSize(known, source)) / spoonSize(known, household);
  }
  const shown = convertForSystem(q, known, system, { standard: household });
  switch (shown.unit) {
    case 'cup':
      return { text: cupText(shown.quantity, spoonSize('cup', household), household, '') };
    case 'tbsp':
    case 'tsp':
      return { text: spoonText(shown.quantity * spoonSize(shown.unit, household), household) };
    case 'g':
    case 'ml':
      return { text: `${roundMetric(shown.quantity)} ${unitLabel(shown.unit, shown.quantity)}` };
    case 'kg':
    case 'l': {
      const r = Math.round(shown.quantity * 20) / 20; // nearest 50 g / 50 ml
      return { text: `${formatDecimal(r)} ${unitLabel(shown.unit, r)}` };
    }
    default: {
      // oz, lb, fl oz, pints, quarts: quarters are as fine as anyone measures.
      const r = Math.max(0.25, Math.round(shown.quantity * 4) / 4);
      return { text: `${formatFraction(r)} ${unitLabel(shown.unit, r)}` };
    }
  }
}

/** Round a count: halves below 3 (quarters below 1/2), whole ones above. Never rounds to zero. */
export function roundCount(quantity: number): number {
  const step = quantity < 0.45 ? 0.25 : quantity < 3 ? 0.5 : 1;
  // Prefer a whole one when it is close: 0.92 eggs is just 1 egg.
  const whole = Math.round(quantity);
  if (whole > 0 && Math.abs(quantity - whole) <= Math.max(0.15, quantity * 0.1)) return whole;
  return Math.max(step, Math.round(quantity / step) * step);
}

function countAmount(quantity: number, label: string, name?: string): KitchenAmount {
  const r = roundCount(quantity);
  const text = label ? `${formatFraction(r)} ${label}` : formatFraction(r);
  const part = r - Math.floor(r);
  let note: string | undefined;
  if (part > 0 && /\beggs?\b/i.test(name ?? '') && !label) {
    const whole = Math.floor(r);
    const share = part === 0.5 ? 'half' : part === 0.25 ? 'a quarter' : 'three quarters';
    note = whole > 0 ? `${whole} whole, plus ${share} of a beaten egg` : `Beat 1 egg and use ${share} of it`;
  }
  return note ? { text, note } : { text };
}

const CUP_PARTS = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];

/** Cups from a standard measuring-cup set, topped up with spoons when needed. */
function cupText(cups: number, cupMl: number, household: MeasureStandard, prefix: string): string {
  if (cups < 0.24) return spoonText(cups * cupMl, household);
  const label = (n: number) => `${prefix}${unitLabel('cup', n)}`;
  const whole = Math.floor(cups);
  const rest = cups - whole;
  // Close enough to a cup in the set: just use that.
  const tolerance = Math.max(0.03, cups * 0.03);
  let nearest = CUP_PARTS[0];
  for (const p of CUP_PARTS) if (Math.abs(rest - p) < Math.abs(rest - nearest)) nearest = p;
  if (Math.abs(rest - nearest) <= tolerance) {
    const n = whole + nearest;
    return `${formatFraction(n)} ${label(n)}`;
  }
  // Otherwise the biggest cup that fits, plus spoons (to the nearest 1/2 tbsp) for the rest.
  let below = 0;
  for (const p of CUP_PARTS) if (p <= rest) below = p;
  const base = whole + below;
  const leftMl = (rest - below) * cupMl;
  const tbsp = spoonSize('tbsp', household);
  const halves = Math.round((leftMl / tbsp) * 2) / 2;
  if (base <= 0) return spoonText(cups * cupMl, household);
  const cupPart = `${formatFraction(base)} ${label(base)}`;
  return halves > 0 ? `${cupPart} + ${formatFraction(halves)} tbsp` : cupPart;
}

/** Spoons: whole and half tablespoons, then teaspoons down to 1/8 tsp. */
function spoonText(ml: number, household: MeasureStandard): string {
  const tsp = spoonSize('tsp', household);
  const tbsp = spoonSize('tbsp', household);
  if (ml < tsp / 12) return 'a pinch';
  const inTbsp = ml / tbsp;
  if (inTbsp >= 0.95) {
    const halves = Math.round(inTbsp * 2) / 2;
    if (Math.abs(inTbsp - halves) <= inTbsp * 0.06) return `${formatFraction(halves)} tbsp`;
    const whole = Math.floor(inTbsp + 0.05);
    const leftTsp = roundTsp(Math.max(0, ml - whole * tbsp) / tsp);
    if (leftTsp <= 0) return `${whole} tbsp`;
    if (leftTsp * tsp >= tbsp - 0.01) return `${whole + 1} tbsp`;
    return `${whole} tbsp + ${formatFraction(leftTsp)} tsp`;
  }
  const t = roundTsp(ml / tsp);
  if (t * tsp >= tbsp - 0.01) return '1 tbsp';
  return `${formatFraction(t)} tsp`;
}

/** Teaspoons to the nearest 1/8 below 1/2, nearest 1/4 below 2, nearest 1/2 above. */
function roundTsp(t: number): number {
  const step = t < 0.5 ? 0.125 : t < 2 ? 0.25 : 0.5;
  return Math.max(t > 0.06 ? 0.125 : 0, Math.round(t / step) * step);
}

function metricText(base: number, dimension: 'mass' | 'volume'): string {
  const [small, big] = dimension === 'mass' ? ['g', 'kg'] : ['ml', 'L'];
  if (base >= 1000) return `${formatDecimal(Math.round(base / 50) / 20)} ${big}`;
  return `${roundMetric(base)} ${small}`;
}

/** Rough grams per ml for common pantry ingredients, matched on the name (most specific first). */
const DENSITIES: Array<[RegExp, number]> = [
  [/icing|powdered sugar|confectioner/, 0.5],
  [/brown sugar/, 0.9],
  [/sugar/, 0.85],
  [/almond meal|ground almond|almond flour/, 0.4],
  [/corn ?flour|corn ?starch/, 0.5],
  [/flour/, 0.53],
  [/cocoa/, 0.5],
  [/rolled oats|\boats\b/, 0.36],
  [/desiccated coconut|shredded coconut/, 0.35],
  [/panko/, 0.2],
  [/breadcrumb/, 0.45],
  [/parmesan/, 0.4],
  [/cream cheese/, 1],
  [/cheese/, 0.45],
  [/peanut butter/, 1.08],
  [/butter/, 0.96],
  [/rice/, 0.85],
  [/chocolate chip|choc chip/, 0.7],
  [/honey|golden syrup/, 1.4],
  [/maple syrup/, 1.32],
  [/sour cream|yoghurt|yogurt/, 1.03],
  [/milk|cream|water|stock|broth|oil|juice|vinegar|wine/, 1],
];

export function guessDensity(name?: string): number | null {
  const n = (name ?? '').toLowerCase();
  if (!n) return null;
  for (const [re, d] of DENSITIES) if (re.test(n)) return d;
  return null;
}

/** Liquids read better in ml than in grams. */
function isLiquid(name?: string): boolean {
  const n = (name ?? '').toLowerCase();
  if (/cream cheese|sour cream|butter(?!milk)|peanut/.test(n)) return false;
  return /milk|cream|water|stock|broth|\boil\b|juice|vinegar|wine|beer|extract|sauce/.test(n);
}

/** Grams and millilitres the way a scale or jug reads them. */
export function roundMetric(n: number): string {
  if (n < 5) return formatDecimal(Math.max(0.5, Math.round(n * 2) / 2));
  if (n < 100) return String(Math.round(n));
  if (n < 250) return String(Math.round(n / 5) * 5);
  return String(Math.round(n / 10) * 10);
}
