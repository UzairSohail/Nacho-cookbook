/**
 * Reading a recipe someone pasted as plain text, for sites that won't let the
 * app fetch their pages. People copy the whole recipe card (or a whole page),
 * so the text has the title, a few details, then "Ingredients", "Instructions"
 * and "Notes" sections, with stray buttons and ratings mixed in.
 *
 * The result has the same shape as a URL import, so it opens in the editor the
 * same way for the person to check.
 */
import type { ImportedIngredientGroup, ImportedRecipe, ImportedStepGroup } from './recipeImport';

export class NoRecipeTextError extends Error {
  constructor() {
    super("Couldn't find any ingredients in that text.");
    this.name = 'NoRecipeTextError';
  }
}

type Section = 'intro' | 'ingredients' | 'method' | 'notes' | 'skip';

const SECTION_HEADINGS: Array<[Section, RegExp]> = [
  ['ingredients', /^(the\s+)?ingredients?( list)?$|^what you('ll)? need$|^you('ll)? need$|^shopping list$/i],
  ['method', /^(the\s+)?(instructions?|method|directions?|steps|preparation|how to make( it| them)?)$/i],
  ['notes', /^(recipe\s+)?(notes?|tips?|cook'?s notes?|chef'?s notes?|notes? (and|&) tips)$/i],
  ['skip', /^(equipment|nutrition( information| facts)?|video|did you make this( recipe)?\??|comments?|reviews?|related recipes|you (may|might) also like)$/i],
];

/** Lines from buttons, ratings and other page furniture. */
const JUNK =
  /^(print( recipe)?|pin( recipe)?|save( recipe)?|share|rate( this)?( recipe)?|jump to recipe|jump to video|cook mode|prevent (your )?screen from (going dark|sleeping|dimming|locking)|keep (your )?screen (awake|on)|scale|cups|us cups|(\d+x\s*)+|metric|us customary|imperial|[★☆✩✭⭐]+.*|\d+(\.\d+)? from \d+ (votes?|reviews?|ratings?)|\d+ (votes?|reviews?|ratings?|comments?)|no ratings yet|click (on )?(the )?stars?.*|step \d+|\d+|ingredients?\s*\d+x.*|- ?\+|advertisement)$/i;

const tidy = (t: string) =>
  t
    .replace(/[   ]/g, ' ')
    .replace(/[▢☐□✓✔◯○●]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const stripHeadingColon = (t: string) => t.replace(/\s*:+$/, '').trim();

const stripStepNumber = (s: string) => s.replace(/^(step\s*)?\d+\s*[.):-]\s*/i, '').replace(/^step\s+\d+\s*/i, '').trim();

/** Minutes in "1 hour 20 minutes", "1 hr 20 mins", "45 min", "1h20m" or a bare "45". */
export function parseMinutesText(s: string): number | undefined {
  const t = s.toLowerCase();
  let total = 0;
  let found = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(days?|d(?![a-z])|hours?|hrs?|h(?![a-z])|minutes?|mins?|m(?![a-z]))/g)) {
    const n = Number(m[1]);
    const unit = m[2];
    total += unit.startsWith('d') ? n * 1440 : unit.startsWith('h') ? n * 60 : n;
    found = true;
  }
  if (!found) {
    const bare = /^\s*(\d+)\s*$/.exec(t);
    if (bare) return Number(bare[1]) || undefined;
    return undefined;
  }
  return total > 0 ? Math.round(total) : undefined;
}

type DetailKey = 'prep' | 'cook' | 'total' | 'servings' | 'course' | 'cuisine' | 'other';

/** Labels that carry a detail, as in "Prep Time: 15 mins" or "Serves 4". */
const DETAIL_LABELS: Array<[DetailKey, RegExp]> = [
  ['prep', /^prep(aration)?( time)?$/i],
  ['cook', /^(cook(ing)?|bake|baking|roast(ing)?|fry(ing)?)( time)?$/i],
  ['total', /^total( time)?$/i],
  ['servings', /^(serves|servings?|yield|yields|makes|portions?|serving size)$/i],
  ['course', /^(course|category|meal( type)?)$/i],
  ['cuisine', /^cuisine$/i],
  ['other', /^(resting|rest|chill(ing)?|chilling|cooling|cool|setting|marinating|freezing|inactive|additional|soaking|rising|proofing)( time)?$|^(keyword|keywords|calories|author|diet|method|equipment)$/i],
];

const detailKey = (label: string): DetailKey | undefined => {
  const l = label.trim().replace(/:$/, '');
  for (const [k, re] of DETAIL_LABELS) if (re.test(l)) return k;
  return undefined;
};

/** All "Label value" pairs in a line such as "Prep Time 15 mins Cook Time 30 mins Servings 4". */
const INLINE_DETAIL = new RegExp(
  String.raw`\b(prep(?:aration)?(?: time)?|cook(?:ing)?(?: time)?|bake(?: time)?|baking(?: time)?|total(?: time)?|serves|servings?|yields?|makes|course|cuisine|resting(?: time)?|rest time|chill(?:ing)?(?: time)?|cooling time|additional time|keywords?|calories|author)\s*(?::\s*|\s+)`,
  'gi',
);

interface Details {
  prep?: number;
  cook?: number;
  total?: number;
  servings?: number;
  tags: string[];
}

function applyDetail(d: Details, key: DetailKey, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  switch (key) {
    case 'prep':
    case 'cook':
    case 'total': {
      const m = parseMinutesText(v);
      if (m == null) return false;
      if (d[key] == null) d[key] = m;
      return true;
    }
    case 'servings': {
      const n = /(\d+(?:\.\d+)?)/.exec(v);
      if (!n || !(Number(n[1]) > 0)) return false;
      if (d.servings == null) d.servings = Number(n[1]);
      return true;
    }
    case 'course':
    case 'cuisine':
      for (const t of v.split(/[,/]/).map((x) => x.trim().toLowerCase())) if (t && t.length <= 30) d.tags.push(t);
      return true;
    default:
      return true;
  }
}

/**
 * Reads a details line, returning true if it was one. Handles "Serves 4",
 * "Prep time: 15 minutes" and several details run together on one line.
 */
function readDetailLine(line: string, d: Details): boolean {
  if (line.length > 160) return false;
  // "Serves 4" / "Makes 12 cookies" / "Serves 4-6 people"
  const serves = /^(serves|servings|yield|yields|makes)\s*:?\s*(\d+(?:\.\d+)?)\b[^.]{0,30}$/i.exec(line);
  if (serves) return applyDetail(d, 'servings', serves[2]);
  const matches = [...line.matchAll(INLINE_DETAIL)];
  if (!matches.length || matches[0].index !== 0) return false;
  let any = false;
  matches.forEach((m, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : line.length;
    const value = line.slice(m.index + m[0].length, end).replace(/[|•·,;]\s*$/, '');
    const key = detailKey(m[1]);
    if (key && applyDetail(d, key, value)) any = true;
  });
  return any;
}

const sectionOf = (line: string): Section | undefined => {
  const l = stripHeadingColon(line.replace(/^#+\s*/, ''));
  for (const [section, re] of SECTION_HEADINGS) if (re.test(l)) return section;
  return undefined;
};

const PROMO = /\b(subscribe|newsletter|instagram|facebook|pinterest|affiliate)\b/i;

/** The recipe's name is a short line, not a sentence or a newsletter plug. */
const looksLikeTitle = (line: string) =>
  line.length <= 80 && !/[.?!]$/.test(line) && !PROMO.test(line);

const URL_LINE = /^(https?:\/\/\S+)$/i;
const STARTS_WITH_AMOUNT = /^([-•*·]\s*)?(\d|[½⅓⅔¼¾⅛⅜⅝⅞]|a |an |one |two |three |pinch |handful |dash )/i;

/** A sub-heading inside a section: "For the sauce:", "Cheesecake filling:", "FROSTING", "## Topping". */
function subHeading(line: string, section: 'ingredients' | 'method'): string | undefined {
  if (/^#+\s+/.test(line)) return stripHeadingColon(line.replace(/^#+\s+/, ''));
  if (line.length > 60) return undefined;
  if (/:$/.test(line) && !/^\d/.test(line)) return stripHeadingColon(line);
  // Shouted headings, "CHEESECAKE FILLING".
  if (/^[^a-z]*[A-Z]{3}[^a-z]*$/.test(line) && !/\d/.test(line) && line.split(' ').length <= 5) return line;
  if (section === 'ingredients' && /^for (the )?\S/i.test(line) && !/\d/.test(line)) return line;
  return undefined;
}

/** Joins lines that a copy broke in two: an amount on its own line before the rest of the ingredient. */
function joinBrokenIngredients(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    // "1 1/2" then "cups" then "plain flour" when copying a table-like card.
    if (/^[\d\s/.½⅓⅔¼¾⅛⅜⅝⅞-]+$/.test(line) && next && !STARTS_WITH_AMOUNT.test(next) && !/:$/.test(next)) {
      lines[i + 1] = `${line} ${next}`;
      continue;
    }
    out.push(line);
  }
  return out;
}

/**
 * Turns pasted recipe text into a recipe for the editor. Throws
 * NoRecipeTextError if no ingredients can be found.
 */
export function parseRecipeText(text: string, sourceUrl = ''): ImportedRecipe {
  const lines = text
    .split(/\r?\n/)
    .map(tidy)
    // Bullets and markdown emphasis people paste from notes apps.
    .map((l) => l.replace(/^\*\*(.+)\*\*$/, '$1').replace(/^__(.+)__$/, '$1'));

  const details: Details = { tags: [] };
  let title = '';
  let url = sourceUrl;
  const intro: string[] = [];
  const ingredientLines: string[] = [];
  const methodLines: string[] = [];
  const notes: string[] = [];
  let section: Section = 'intro';
  let sawIngredientsHeading = false;
  /** A label alone on its line ("Prep Time"), waiting for its value on the next line. */
  let pendingLabel: DetailKey | undefined;

  let lastTime: { key: 'prep' | 'cook' | 'total'; value: number } | undefined;

  for (const raw of lines) {
    if (!raw) {
      pendingLabel = undefined;
      continue;
    }
    let line = raw;
    const urlMatch = URL_LINE.exec(line);
    if (urlMatch) {
      if (!url) url = urlMatch[1];
      continue;
    }
    const heading = sectionOf(line);
    if (heading) {
      section = heading;
      if (heading === 'ingredients') sawIngredientsHeading = true;
      pendingLabel = undefined;
      continue;
    }
    if (section === 'skip') continue;
    if (section === 'intro' && pendingLabel) {
      const key = pendingLabel;
      pendingLabel = undefined;
      // "Prep Time" / "15" / "minutes" when copying a recipe card: the unit comes on the next line.
      const had = key === 'prep' || key === 'cook' || key === 'total' ? details[key] : undefined;
      if (applyDetail(details, key, line)) {
        if ((key === 'prep' || key === 'cook' || key === 'total') && had == null && /^\d+$/.test(line)) {
          lastTime = { key, value: details[key]! };
        }
        continue;
      }
    }
    // A bare amount in the ingredients is half of a line the copy broke in two.
    const brokenAmount = section === 'ingredients' && /^[\d\s/.½⅓⅔¼¾⅛⅜⅝⅞-]+$/.test(line);
    if (JUNK.test(line) && !brokenAmount) continue;

    if (section === 'intro') {
      const alone = detailKey(line);
      if (alone) {
        pendingLabel = alone;
        continue;
      }
      // "Total: 1" then "hour": a lone unit word finishes the time before it.
      const unitOnly = /^(minutes?|mins?|hours?|hrs?|hr)\b\s*/i.exec(line);
      if (unitOnly) {
        if (/^h/i.test(unitOnly[1]) && lastTime && details[lastTime.key] === lastTime.value) {
          details[lastTime.key] = lastTime.value * 60;
        }
        lastTime = undefined;
        line = line.slice(unitOnly[0].length);
        if (!line) continue;
      }
      const before = { prep: details.prep, cook: details.cook, total: details.total };
      if (readDetailLine(line, details)) {
        lastTime = undefined;
        for (const k of ['prep', 'cook', 'total'] as const) {
          // A bare number may still get its unit from the next line.
          if (before[k] == null && details[k] != null && /\d\s*$/.test(line)) lastTime = { key: k, value: details[k]! };
        }
        continue;
      }
      if (!title && looksLikeTitle(line)) {
        title = line.replace(/\s+recipe$/i, '').trim();
        continue;
      }
      intro.push(line);
      continue;
    }
    if (section === 'ingredients') ingredientLines.push(line);
    else if (section === 'method') methodLines.push(line);
    else if (section === 'notes') notes.push(line);
  }

  // No "Ingredients" heading: take short lines that start with an amount as ingredients, and the rest as steps.
  if (!sawIngredientsHeading) {
    const rest = intro.splice(0);
    let i = 0;
    while (i < rest.length && !STARTS_WITH_AMOUNT.test(rest[i]) && !/^[-•*·]\s/.test(rest[i])) intro.push(rest[i++]);
    for (; i < rest.length; i++) {
      const l = rest[i];
      const numberedStep = /^(step\s*)?\d+[.)]\s+\S/i.test(l) && l.length > 50;
      if (!methodLines.length && !numberedStep && (l.length <= 80 || STARTS_WITH_AMOUNT.test(l))) ingredientLines.push(l);
      else methodLines.push(l);
    }
  }

  const ingredients: ImportedIngredientGroup[] = [{ items: [] }];
  for (const l of joinBrokenIngredients(ingredientLines)) {
    const h = subHeading(l, 'ingredients');
    if (h !== undefined) ingredients.push({ heading: h || undefined, items: [] });
    else ingredients[ingredients.length - 1].items.push(l.replace(/^[-•*·]\s*/, ''));
  }

  const instructions: ImportedStepGroup[] = [{ steps: [] }];
  for (const l of methodLines) {
    const h = subHeading(l, 'method');
    if (h !== undefined) instructions.push({ heading: h || undefined, steps: [] });
    else {
      const step = stripStepNumber(l.replace(/^[-•*·]\s*/, ''));
      if (step) instructions[instructions.length - 1].steps.push(step);
    }
  }

  const groups = ingredients.filter((g) => g.items.length);
  if (!groups.length) throw new NoRecipeTextError();

  let { prep, cook } = details;
  const { total } = details;
  if (cook == null && total != null) cook = prep != null && total > prep ? total - prep : prep == null ? total : undefined;

  return {
    title: title || 'Pasted recipe',
    // Sentences only: short leftovers such as "Main French" are labels from the card.
    description: intro.filter((l) => l.split(' ').length >= 4 && !PROMO.test(l)).join(' ').slice(0, 500) || undefined,
    servings: details.servings,
    prepMinutes: prep,
    cookMinutes: cook,
    ingredients: groups,
    instructions: instructions.filter((g) => g.steps.length),
    notes: notes.map((n) => n.replace(/^[-•*·]\s*/, '')).join('\n') || undefined,
    tags: [...new Set(details.tags)],
    sourceUrl: url,
    foundBy: 'pasted',
  };
}
