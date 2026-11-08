/**
 * Unit definitions and conversions.
 *
 * Every known unit belongs to a dimension (mass, volume or count) and has a
 * factor to that dimension's base unit (grams for mass, millilitres for
 * volume). Anything we don't recognise ("clove", "can", "pinch") is kept as a
 * free-text unit and never converted.
 */

export type Dimension = 'mass' | 'volume' | 'count';
export type UnitSystem = 'metric' | 'imperial';

/**
 * Cups and spoons differ by country:
 * - metric: 250 ml cup, 15 ml tbsp, 5 ml tsp (UK, NZ, Canada, most recipe sites outside the US)
 * - au:     250 ml cup, 20 ml tbsp, 5 ml tsp (Australia)
 * - us:     236.6 ml cup, 14.8 ml tbsp, 4.93 ml tsp
 */
export type MeasureStandard = 'metric' | 'au' | 'us';

export interface UnitOptions {
  /** The cup and spoon sizes in use (the household's, or the recipe's when converting from it). */
  standard?: MeasureStandard;
}

export function isSpoonUnit(unit: KnownUnit): unit is SpoonUnit {
  return unit === 'tsp' || unit === 'tbsp' || unit === 'cup';
}

/** Size of one cup or spoon in millilitres under a standard. */
export function spoonSize(unit: SpoonUnit, standard: MeasureStandard): number {
  return SPOONS[standard][unit];
}

type FixedUnit = 'g' | 'kg' | 'oz' | 'lb' | 'ml' | 'l' | 'floz' | 'pint' | 'quart' | 'piece';
export type SpoonUnit = 'tsp' | 'tbsp' | 'cup';
export type KnownUnit = FixedUnit | SpoonUnit;

const FIXED: Record<FixedUnit, { dimension: Dimension; factor: number }> = {
  g: { dimension: 'mass', factor: 1 },
  kg: { dimension: 'mass', factor: 1000 },
  oz: { dimension: 'mass', factor: 28.349523125 },
  lb: { dimension: 'mass', factor: 453.59237 },
  ml: { dimension: 'volume', factor: 1 },
  l: { dimension: 'volume', factor: 1000 },
  floz: { dimension: 'volume', factor: 29.5735295625 },
  pint: { dimension: 'volume', factor: 473.176473 },
  quart: { dimension: 'volume', factor: 946.352946 },
  piece: { dimension: 'count', factor: 1 },
};

const SPOONS: Record<MeasureStandard, Record<SpoonUnit, number>> = {
  metric: { tsp: 5, tbsp: 15, cup: 250 },
  au: { tsp: 5, tbsp: 20, cup: 250 },
  us: { tsp: 4.92892159375, tbsp: 14.78676478125, cup: 236.5882365 },
};

const ALIASES: Record<string, KnownUnit> = {
  g: 'g', gram: 'g', grams: 'g', gr: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  'fl oz': 'floz', floz: 'floz', 'fluid ounce': 'floz', 'fluid ounces': 'floz',
  pint: 'pint', pints: 'pint', pt: 'pint',
  quart: 'quart', quarts: 'quart', qt: 'quart',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', t: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp', T: 'tbsp',
  cup: 'cup', cups: 'cup', c: 'cup',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', whole: 'piece',
};

/** Normalise a unit string to a known unit, or return null if we don't recognise it. */
export function parseUnit(unit: string | null | undefined): KnownUnit | null {
  if (unit == null) return null;
  const trimmed = unit.trim().replace(/\.$/, '');
  if (trimmed === '') return 'piece';
  // "T" (tablespoon) vs "t" (teaspoon) is case sensitive; everything else isn't.
  if (trimmed === 'T' || trimmed === 't') return ALIASES[trimmed];
  return ALIASES[trimmed.toLowerCase()] ?? null;
}

export function dimensionOf(unit: KnownUnit): Dimension {
  if (unit === 'tsp' || unit === 'tbsp' || unit === 'cup') return 'volume';
  return FIXED[unit].dimension;
}

/** Size of one `unit` in base units (g or ml). */
export function baseFactor(unit: KnownUnit, opts: UnitOptions = {}): number {
  if (unit === 'tsp' || unit === 'tbsp' || unit === 'cup') {
    return SPOONS[opts.standard ?? 'metric'][unit];
  }
  return FIXED[unit].factor;
}

export function toBase(quantity: number, unit: KnownUnit, opts: UnitOptions = {}): number {
  return quantity * baseFactor(unit, opts);
}

/**
 * Convert a quantity between two units. Converting between mass and volume
 * needs a density (grams per millilitre); without one this returns null.
 */
export function convert(
  quantity: number,
  from: KnownUnit,
  to: KnownUnit,
  opts: UnitOptions & { density?: number | null; toStandard?: MeasureStandard } = {},
): number | null {
  const fromDim = dimensionOf(from);
  const toDim = dimensionOf(to);
  let base = toBase(quantity, from, opts);
  if (fromDim !== toDim) {
    if (!opts.density || fromDim === 'count' || toDim === 'count') return null;
    base = fromDim === 'volume' ? base * opts.density : base / opts.density;
  }
  return base / baseFactor(to, { standard: opts.toStandard ?? opts.standard });
}

export interface Measure {
  quantity: number;
  unit: KnownUnit;
}

/**
 * Pick a readable unit for an amount given in base units (g or ml) for the
 * chosen system. Used for shopping list totals and for converting recipes.
 */
export function bestUnit(
  baseQuantity: number,
  dimension: Dimension,
  system: UnitSystem,
  opts: UnitOptions = {},
): Measure {
  if (dimension === 'count') return { quantity: baseQuantity, unit: 'piece' };
  if (dimension === 'mass') {
    if (system === 'metric') {
      return baseQuantity >= 1000
        ? { quantity: baseQuantity / 1000, unit: 'kg' }
        : { quantity: baseQuantity, unit: 'g' };
    }
    const oz = baseQuantity / FIXED.oz.factor;
    return oz >= 16 ? { quantity: oz / 16, unit: 'lb' } : { quantity: oz, unit: 'oz' };
  }
  // volume
  const spoons = SPOONS[opts.standard ?? 'metric'];
  if (system === 'metric') {
    if (baseQuantity < spoons.tbsp - 0.01) return { quantity: baseQuantity / spoons.tsp, unit: 'tsp' };
    if (baseQuantity < 60) return { quantity: baseQuantity / spoons.tbsp, unit: 'tbsp' };
    return baseQuantity >= 1000
      ? { quantity: baseQuantity / 1000, unit: 'l' }
      : { quantity: baseQuantity, unit: 'ml' };
  }
  if (baseQuantity < spoons.tbsp - 0.01) return { quantity: baseQuantity / spoons.tsp, unit: 'tsp' };
  if (baseQuantity < spoons.cup / 4 - 0.01) return { quantity: baseQuantity / spoons.tbsp, unit: 'tbsp' };
  if (baseQuantity >= spoons.cup * 16) return { quantity: baseQuantity / FIXED.quart.factor, unit: 'quart' };
  return { quantity: baseQuantity / spoons.cup, unit: 'cup' };
}

const METRIC_UNITS: ReadonlySet<KnownUnit> = new Set(['g', 'kg', 'ml', 'l']);
const IMPERIAL_UNITS: ReadonlySet<KnownUnit> = new Set(['oz', 'lb', 'floz', 'pint', 'quart', 'cup']);

/**
 * Convert a recipe measure for display in the chosen system. Spoons are used
 * in both systems so they stay as they are, unless they are large enough to
 * read better in another unit (12 tsp shows as 1/4 cup or 60 ml).
 */
export function convertForSystem(
  quantity: number,
  unit: KnownUnit,
  system: UnitSystem,
  opts: UnitOptions = {},
): Measure {
  const dimension = dimensionOf(unit);
  if (dimension === 'count') return { quantity, unit };
  const isSpoon = unit === 'tsp' || unit === 'tbsp';
  const foreign = system === 'metric' ? IMPERIAL_UNITS : METRIC_UNITS;
  // Cups are used in metric countries too, so a recipe written in cups keeps them.
  if (unit === 'cup' && system === 'metric') return { quantity, unit };
  // Already in the right system: show as written.
  if (!foreign.has(unit) && !isSpoon) return { quantity, unit };
  const best = bestUnit(toBase(quantity, unit, opts), dimension, system, opts);
  if (isSpoon && best.unit === unit) return { quantity, unit }; // avoid float noise
  return best;
}

const LABELS: Record<KnownUnit, [string, string]> = {
  g: ['g', 'g'],
  kg: ['kg', 'kg'],
  oz: ['oz', 'oz'],
  lb: ['lb', 'lb'],
  ml: ['ml', 'ml'],
  l: ['L', 'L'],
  floz: ['fl oz', 'fl oz'],
  pint: ['pint', 'pints'],
  quart: ['quart', 'quarts'],
  tsp: ['tsp', 'tsp'],
  tbsp: ['tbsp', 'tbsp'],
  cup: ['cup', 'cups'],
  piece: ['', ''],
};

export function unitLabel(unit: KnownUnit, quantity: number): string {
  const [one, many] = LABELS[unit];
  return quantity > 1 ? many : one;
}
