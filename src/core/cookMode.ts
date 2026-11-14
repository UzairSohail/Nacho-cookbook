/**
 * The logic behind cooking mode: the method as one screen per step, which
 * ingredients each step uses, and the timers a step's wording asks for.
 */
import { looksLikeStepHeading } from './ingredientLine';
import type { Ingredient, Recipe } from './types';

export interface CookStep {
  /** 1-based, counting real steps only (headings aren't numbered). */
  number: number;
  /** Position in recipe.steps. */
  index: number;
  text: string;
  photoUrl?: string;
  /** The "Heading:" line this step sits under, e.g. "Garlic confit". */
  section?: string;
}

/**
 * The steps to cook through, with "Heading:" lines turned into the section
 * name of the steps below them rather than a screen of their own.
 */
export function cookSteps(recipe: Pick<Recipe, 'steps'>): CookStep[] {
  const out: CookStep[] = [];
  let section: string | undefined;
  recipe.steps.forEach((step, i) => {
    const text = step.text.trim();
    // Same rule as the recipe page: a last line is never a heading.
    if (!step.photoUrl && i < recipe.steps.length - 1 && looksLikeStepHeading(text)) {
      section = text.replace(/\s*:+$/, '').trim();
      return;
    }
    if (!text && !step.photoUrl) return;
    out.push({ number: out.length + 1, index: i, text, photoUrl: step.photoUrl, section });
  });
  return out;
}

export interface StepTimer {
  /** How long to set it for. */
  seconds: number;
  /** As the step says it, tidied: "20 min", "1 hr 15 min", "10–12 min". */
  label: string;
}

const NUM = String.raw`(\d+(?:\.\d+)?(?:\s+\d\/\d)?|\d\/\d|[½¼¾⅓⅔]|\d+\s*[½¼¾⅓⅔]|an?|one|two|three|four|five|six|ten|fifteen|twenty|thirty|forty|forty-five|ninety)`;
// Word units may follow a space; single letters must touch the number ("5m", "45s"),
// as "5 m" is more likely metres.
const UNIT = String.raw`(?:\s*-?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)|(h|m|s))\b`;
// "20 min", "1-2 hours", "10 to 12 minutes", "1 hour 15 minutes", "1 hr and 20 mins".
const DURATION = new RegExp(
  String.raw`\b${NUM}(?:\s*(?:-|–|to)\s*${NUM})?${UNIT}(?:\s*(?:and\s+)?${NUM}${UNIT})?`,
  'gi',
);

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, fifteen: 15,
  twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, ninety: 90,
};
const VULGAR: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

function num(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (t in WORDS) return WORDS[t];
  const mixed = /^(\d+)?\s*([½¼¾⅓⅔])$/.exec(t);
  if (mixed) return Number(mixed[1] ?? 0) + VULGAR[mixed[2]];
  const frac = /^(?:(\d+)\s+)?(\d)\/(\d)$/.exec(t);
  if (frac) return Number(frac[1] ?? 0) + Number(frac[2]) / Number(frac[3]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function unitSeconds(u: string): number {
  const t = u.toLowerCase();
  if (t.startsWith('h')) return 3600;
  if (t.startsWith('m')) return 60;
  return 1;
}

/** "1 hr 15 min", "20 min", "90 sec". */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} sec`;
  if (s < 120 && s % 60) return `${s} sec`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const parts = [];
  if (h) parts.push(`${h} hr`);
  if (m) parts.push(`${m} min`);
  if (rest) parts.push(`${rest} sec`);
  return parts.join(' ');
}

/** "12:05" or "1:02:05", for a running timer. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * The timers a step asks for: "bake 20 min" gives one 20 minute timer. A
 * range ("10–12 minutes") starts at the shorter time so you can check early.
 * Bare letters like "5 m" only count straight after a number, and anything
 * under 10 seconds or over 24 hours is ignored as not really a timer.
 */
export function stepTimers(text: string): StepTimer[] {
  const out: StepTimer[] = [];
  for (const m of text.matchAll(DURATION)) {
    const [, a, b, wordUnit, letterUnit, c, wordUnit2, letterUnit2] = m;
    const unit = wordUnit ?? letterUnit;
    const unit2 = wordUnit2 ?? letterUnit2;
    // "a minute" is fine, but "am" or "as" is not a time.
    if (/^(an?|one|two|three|four|five|six|ten)$/i.test(a) && !wordUnit) continue;
    const first = num(a);
    if (first == null) continue;
    const second = num(b);
    const per = unitSeconds(unit);
    let seconds = first * per;
    if (c && unit2) seconds += (num(c) ?? 0) * unitSeconds(unit2);
    if (seconds < 10 || seconds > 24 * 3600) continue;
    const label =
      second != null && !c
        ? `${tidy(first)}–${tidy(second)} ${shortUnit(unit, second)}`
        : formatDuration(seconds);
    if (out.some((t) => t.seconds === Math.round(seconds) && t.label === label)) continue;
    out.push({ seconds: Math.round(seconds), label });
  }
  return out;
}

const tidy = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const shortUnit = (u: string, n: number) => {
  const t = u.toLowerCase();
  if (t.startsWith('h')) return n === 1 ? 'hr' : 'hrs';
  if (t.startsWith('m')) return 'min';
  return 'sec';
};

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** "tomatoes" -> "tomato", "berries" -> "berry", "leaves" -> "leaf". */
function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.endsWith('oes')) return w.slice(0, -2);
  if (w.endsWith('ves')) return `${w.slice(0, -3)}f`;
  if (w.endsWith('ches') || w.endsWith('shes') || w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Words that name too many things to pick an ingredient out on their own. */
const VAGUE = new Set(['powder', 'sauce', 'paste', 'mix', 'leaf', 'seed', 'stock', 'juice', 'water', 'extract', 'fresh', 'ground', 'large', 'small']);

/** Words that say which kind, not what it is. */
const DESCRIBING = new Set([
  'brown', 'red', 'white', 'green', 'black', 'yellow', 'plain', 'self', 'raising', 'caster', 'icing', 'dried', 'light',
  'dark', 'baby', 'whole', 'frozen', 'tinned', 'canned', 'unsalted', 'salted', 'extra', 'virgin', 'fine', 'coarse',
  'chopped', 'sliced', 'diced', 'minced', 'grated', 'boneless', 'skinless', 'smoked', 'sweet', 'hot', 'mild', 'thick',
  'thin', 'full', 'cream', 'low', 'fat', 'free', 'range', 'organic', 'warm', 'cold', 'soft', 'hard', 'medium', 'big',
]);

const EVERYTHING = /\b(all (of )?the ingredients|all ingredients|everything)\b/i;

/**
 * Which of the recipe's ingredients a step uses, by name: "Add the flour"
 * finds "plain flour". A full name wins over a shared last word, so "olive
 * oil" in the step doesn't also pull in "sesame oil". When the step sits under
 * a heading that matches an ingredient group ("Sauce"), that group's items win
 * over the same ingredient elsewhere in the recipe. "Mix everything" gives
 * every ingredient.
 */
export function stepIngredients(
  recipe: Pick<Recipe, 'ingredients'>,
  step: Pick<CookStep, 'text' | 'section'>,
  catalog: Map<string, Pick<Ingredient, 'name'>>,
): number[] {
  if (EVERYTHING.test(step.text)) return recipe.ingredients.map((_, i) => i);
  const words = normalise(step.text).split(' ').filter(Boolean).map(singular);
  const text = ` ${words.join(' ')} `;
  const taken: Array<[number, number]> = [];
  const found = new Set<number>();

  const names = recipe.ingredients.map((item) => {
    const raw = catalog.get(item.ingredientId)?.name ?? item.ingredientId;
    return normalise(raw).split(' ').filter(Boolean).map(singular);
  });

  const spans = (phrase: string) => {
    const out: Array<[number, number]> = [];
    const needle = ` ${phrase} `;
    let at = text.indexOf(needle);
    while (at >= 0) {
      out.push([at, at + needle.length]);
      at = text.indexOf(needle, at + 1);
    }
    return out;
  };
  const overlaps = ([a, b]: [number, number]) => taken.some(([x, y]) => a < y && x < b);

  // Full names first, longest first, so they claim their words.
  const order = names.map((_, i) => i).sort((a, b) => names[b].length - names[a].length);
  for (const i of order) {
    const phrase = names[i].join(' ');
    if (!phrase) continue;
    // The same name twice (flour in the cake and the crumble) finds both.
    const twin = [...found].some((j) => names[j].join(' ') === phrase);
    const hit = spans(phrase).filter((s) => twin || !overlaps(s));
    if (hit.length) {
      found.add(i);
      taken.push(...hit);
    }
  }
  // Then the main word of the name: "flour" for "plain flour", "chicken"
  // for "chicken thighs". Describing words like "brown" or "plain" don't count.
  for (const i of order) {
    if (found.has(i) || names[i].length < 2) continue;
    const head = names[i][names[i].length - 1];
    // "curry powder" is its own thing: "the curry" in a step means the dish.
    const words = VAGUE.has(head) ? [] : [head, ...names[i].slice(0, -1).reverse()];
    for (const w of words) {
      if (w.length < 3 || VAGUE.has(w) || DESCRIBING.has(w)) continue;
      if (w !== head && w.length < 4) continue;
      const hit = spans(w).filter((s) => !overlaps(s));
      if (hit.length) {
        found.add(i);
        break;
      }
    }
  }
  // Two names the same once tidied ("flour" in the cake and the crumble):
  // keep all, unless the step's heading picks one group.
  let result = [...found].sort((a, b) => a - b);
  const section = step.section ? normalise(step.section).split(' ').map(singular) : [];
  if (section.length) {
    const groupWords = (i: number) => normalise(recipe.ingredients[i].group ?? '').split(' ').map(singular);
    const inSection = (i: number) => groupWords(i).some((w) => w.length > 2 && section.includes(w));
    result = result.filter((i) => {
      const twins = result.filter((j) => names[j].join(' ') === names[i].join(' '));
      if (twins.length < 2 || !twins.some(inSection)) return true;
      return inSection(i);
    });
  }
  return result;
}
