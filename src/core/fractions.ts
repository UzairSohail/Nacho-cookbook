/**
 * Kitchen-friendly number formatting: 0.75 -> "3/4", 1.5 -> "1 1/2",
 * 0.333 -> "1/3". Metric weights and volumes are shown as rounded decimals
 * instead, because nobody weighs "1/3 g".
 */

const FRACTIONS: Array<[number, string]> = [
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [3 / 8, '3/8'],
  [1 / 2, '1/2'],
  [5 / 8, '5/8'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [7 / 8, '7/8'],
];

const TOLERANCE = 0.04;

/** Format as a whole number plus the nearest common fraction, if one is close enough. */
export function formatFraction(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (value < 0) return `-${formatFraction(-value)}`;
  const whole = Math.floor(value);
  const rest = value - whole;
  if (rest < TOLERANCE) return String(whole);
  if (1 - rest < TOLERANCE) return String(whole + 1);
  let best: [number, string] | null = null;
  for (const f of FRACTIONS) {
    const diff = Math.abs(rest - f[0]);
    if (diff < TOLERANCE && (!best || diff < Math.abs(rest - best[0]))) best = f;
  }
  if (!best) return formatDecimal(value);
  return whole === 0 ? best[1] : `${whole} ${best[1]}`;
}

/** Round to a sensible number of significant digits and drop trailing zeros. */
export function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return String(Number(value.toFixed(digits)));
}

/** Parse "1 1/2", "3/4", "1.5", "1,5" or "½" into a number. Returns null if unparseable. */
export function parseQuantity(input: string): number | null {
  const unicode: Record<string, string> = {
    '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
    '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
  };
  let s = input.trim();
  for (const [ch, frac] of Object.entries(unicode)) s = s.replace(ch, ` ${frac}`);
  s = s.replace(',', '.').trim();
  if (s === '') return null;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
