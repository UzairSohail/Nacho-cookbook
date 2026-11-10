/**
 * Reading a recipe someone pasted as plain text, for sites that won't let the
 * app fetch their pages. People copy the whole recipe card (or a whole page),
 * so the text has the title, a few details, then "Ingredients", "Instructions"
 * and "Notes" sections, with stray buttons and ratings mixed in.
 *
 * The result has the same shape as a URL import, so it opens in the editor the
 * same way for the person to check.
 */
import { looksLikeStepHeading } from './ingredientLine';
import type { ImportedIngredientGroup, ImportedRecipe, ImportedStepGroup } from './recipeImport';

export class NoRecipeTextError extends Error {
  constructor() {
    super("Couldn't find any ingredients in that text.");
    this.name = 'NoRecipeTextError';
  }
}

type Section = 'intro' | 'ingredients' | 'method' | 'notes' | 'skip';

const SECTION_HEADINGS: Array<[Section, RegExp]> = [
  ['ingredients', /^(the\s+)?(main\s+)?ingredients?( list)?$|^what (you('ll)?|you will|we('ll)?) need$|^(you('ll)?|you will) need$|^(shopping|grocery) list$/i],
  ['method', /^(the\s+)?(instructions?|method|directions?|steps|preparation|how to( make| cook)?( it| them| this)?|cooking (instructions?|method|steps|directions)|to make)$/i],
  ['notes', /^((recipe|important|extra|additional|helpful|quick|my|cook'?s|chef'?s)\s+)?(notes?|tips?|notes? (and|&) tips)$/i],
  ['skip', /^(equipment|nutrition( information| facts)?|video|did you make this( recipe)?\??|comments?|reviews?|related recipes|you (may|might) also like)$/i],
];

/** Lines from buttons, ratings and other page furniture. */
const JUNK =
  /^(print( recipe)?|pin( recipe)?|save( recipe)?|share|rate( this)?( recipe)?|jump to recipe|jump to video|cook mode|prevent (your )?screen from (going dark|sleeping|dimming|locking)|keep (your )?screen (awake|on)|scale|cups|us cups|(\d+x\s*)+|metric|us customary|imperial|[★☆✩✭⭐]+.*|\d+(\.\d+)? from \d+ (votes?|reviews?|ratings?)|\d+ (votes?|reviews?|ratings?|comments?)|no ratings yet|click (on )?(the )?stars?.*|step \d+|\d+|ingredients?\s*\d+x.*|- ?\+|advertisement|announcements?:?|(the |full )?recipe( below| here| is below)?:?|here'?s (how|the (full )?recipe)[^.]{0,30}:?|[.,·•…_~*=–—-]+)$/i;

/**
 * A nutrition line from a caption: "Macros per serving (x3 servings): approx 607
 * calories | 45g P | 39g C | 30g F" or "75gC | 30gF | 140gP". Never an ingredient.
 */
const MACROS =
  /^\(?\s*(macros?|nutrition( info)?|calories)\b|\b\d+\s*g\s*(p|c|f|protein|carbs?|fat)\b\s*\||^per\b[^:]{0,40}:?\s*\d+\s*(k?cals?|calories)\b/i;

/** "#mealprep #highprotein #naan highproteinmealprep": the caption's tags, never part of the recipe. */
const HASHTAG_LINE = /^#[\p{L}\p{N}_]+(\s+#?[\p{L}\p{N}_]+)*$/u;
const TRAILING_HASHTAGS = /(\s+#[\p{L}\p{N}_]+)+$/u;

/**
 * "Storage & Heating", "To reheat", "Make ahead": how to keep and warm up the
 * dish. They are steps to follow, so they go in the method under that heading.
 */
const STORAGE_HEADING =
  /^(storage|storing|to store|reheat(ing)?|to reheat|heating|freezing|to freeze|leftovers|make[- ]ahead|meal[- ]prep)(\s*(and|&|\/|,)\s*(storage|storing|heating|reheating|freezing|leftovers))*(\s+(instructions?|tips|notes|guide))?$/i;
const storageHeading = (line: string) => {
  const l = stripHeadingColon(line.replace(/^#+\s*/, ''));
  return STORAGE_HEADING.test(l) ? l : undefined;
};

/** A word that leaves a line unfinished, so the next line carries on from it: "...at 200°C till". */
const DANGLING_WORD = /\b(till|until|and|or|to|with|the|a|an|of|for|in|on|at|then|into|from|about)$/i;

/**
 * Bullets a copy broke in two: "- airfry for 4-5 minutes at 200°C till" then
 * "Crispy and lightly puffed again". Gives the indexes of lines joined onto the
 * bullet before them.
 */
function joinBrokenBullets(lines: string[]): Set<number> {
  const joined = new Set<number>();
  const canJoin = (line: string, next: string | undefined) =>
    !!next &&
    /^[-•*·]\s/.test(line) &&
    !/^[-•*·]\s/.test(next) &&
    !/[.!?:]$/.test(line) &&
    !sectionOf(next) &&
    !storageHeading(next) &&
    !STARTS_WITH_AMOUNT.test(next) &&
    (DANGLING_WORD.test(line) || /^[a-z]/.test(next));
  for (let i = 0; i < lines.length; i++) {
    let j = i + 1;
    while (canJoin(lines[i], lines[j])) {
      lines[i] = `${lines[i]} ${lines[j][0].toLowerCase()}${lines[j].slice(1)}`;
      joined.add(j++);
    }
    i = j - 1;
  }
  return joined;
}

/** Emoji people put after ingredients and steps in captions ("Chives, to garnish 🌿"). */
const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const dropEmoji = (t: string) => t.replace(EMOJI, '').replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();

const tidy = (t: string) =>
  t
    .replace(/[   ]/g, ' ')
    .replace(/[▢☐□✓✔◯○●]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** "Ingredients 👇" and "Sauce ⬇️": a pointing-down emoji after a few words makes a heading. */
const POINTS_DOWN = /[\u{1F447}\u{2B07}\u{2935}\u{1F53D}]/u;

/**
 * A line with the emoji taken out, as captions are full of them: keycap steps
 * ("1️⃣ Boil the pasta") become "1. Boil the pasta", and a short line ending in
 * a pointing-down emoji becomes a heading with a colon.
 */
function withoutEmoji(line: string): string {
  const keycap = line.replace(/^(\d{1,2})\u{FE0F}?\u{20E3}\s*[.):-]?\s*/u, '$1. ');
  const bare = dropEmoji(keycap);
  if (bare !== keycap && POINTS_DOWN.test(line) && bare.length <= 40 && !/[.!?:]$/.test(bare) && !/^\d/.test(bare)) return `${bare}:`;
  return bare;
}

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
  // Unless more details follow, as in "Serves 4 | Prep 10 mins | Cook 20 mins".
  if (serves && [...line.matchAll(INLINE_DETAIL)].length <= 1) return applyDetail(d, 'servings', serves[2]);
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

/** Words that start a step, so "Mix all sauce ingredients" is never read as a heading. */
const STEP_VERB = /^(add|mix|combine|stir|whisk|place|put|pour|prepare|gather|measure|season|toss|blend|cook|serve|use|set|keep|transfer|fold|beat)\b/i;

/**
 * A heading for one part of a recipe with several parts: "Ingredients: (Chicken)",
 * "Ingredients - Sauce", "Ingredients for the sauce:", "Sauce ingredients:" or
 * "Method (Fries)". Gives the section and the part's name.
 */
function partHeading(line: string, current: Section): { section: 'ingredients' | 'method'; part: string } | undefined {
  const l = line.replace(/^#+\s*/, '').trim();
  if (l.length > 70 || /^\d/.test(l)) return undefined;
  const word = String.raw`(ingredients?|instructions?|method|directions?|steps)`;
  const sectionFor = (w: string) => (/^ingredient/i.test(w) ? 'ingredients' : 'method');
  const tidyPart = (p: string) => p.replace(/^[(\[]\s*|\s*[)\]]$/g, '').replace(/^for\s+(the\s+)?/i, '').replace(/\s*:+$/, '').trim();
  // "Ingredients: (Chicken)", "Ingredients - Sauce", "Ingredients (for the sauce):", "Ingredients for the sauce"
  const after = new RegExp(String.raw`^${word}\s*(?:[:\-–—]\s*(.+)|(\(.+\)|\[.+\])\s*:?|\s(for\s.+?)\s*:?)$`, 'i').exec(l);
  if (after) {
    const part = tidyPart(after[2] ?? after[3] ?? after[4] ?? '');
    // "Ingredients: 2 cups flour" is an ingredient after a heading, not a part name.
    if (part && part.split(/\s+/).length <= 5 && !/^\d/.test(part)) return { section: sectionFor(after[1]), part };
    return undefined;
  }
  // "Sauce ingredients:", "For the chicken ingredients", "Chicken Method"
  const before = new RegExp(String.raw`^(?:for\s+(?:the\s+)?)?([\p{L}'’& ]{2,40}?)\s+${word}\s*:?$`, 'iu').exec(l);
  if (before && before[1].trim().split(/\s+/).length <= 4 && !STEP_VERB.test(before[1].trim()) && !/^(the|all|your|any|remaining|other)$/i.test(before[1].trim()) &&
    // Inside the steps, only with a colon: "then the wet ingredients" is part of a step.
    (current !== 'method' || /:$/.test(l))) {
    return { section: sectionFor(before[2]), part: before[1].trim() };
  }
  return undefined;
}

/** "1. Butterfly the chicken…" or "Step 2: Coat…", but not "1.5 Tsp Salt". */
const NUMBERED_STEP_NUMBER = /^(step\s*)?\d+\s*[.):]\s+/i;
const NUMBERED_STEP = /^(step\s*)?\d+\s*[.):]\s+[\p{L}"“(]/iu;

/**
 * "1 Tsp Paprika, 1/2 Tsp Cayenne & 1 Tsp Salt" as separate ingredients. Only
 * when every piece starts with an amount, so "2 chicken breasts, sliced" and
 * "Salt & pepper" stay whole. Commas inside brackets don't count.
 */
function splitIngredientList(line: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    else if (depth === 0) {
      const sep = /^(,\s*|\s+&\s+|\s+and\s+|\s*\+\s+)/i.exec(line.slice(i));
      if (sep && (ch === ',' || /\s/.test(ch))) {
        pieces.push(line.slice(start, i));
        i += sep[0].length - 1;
        start = i + 1;
      }
    }
  }
  pieces.push(line.slice(start));
  const parts = pieces.map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => /^(\d|[½⅓⅔¼¾⅛⅜⅝⅞])/.test(p))) return [line];
  return parts;
}

const PROMO =
  /\b(subscribe|newsletter|instagram|facebook|pinterest|affiliate|cookbooks?|e-?books?|grab yours|link in (my )?bio|out now|use (my )?code|discount code|giveaway)\b|@[\w.]+/i;

/** The recipe's name is a short line, not a sentence or a newsletter plug. */
const looksLikeTitle = (line: string) =>
  line.length <= 80 && !/[.?!:]$/.test(line) && !PROMO.test(line) && !(/,/.test(line) && line.split(/\s+/).length > 6);

/**
 * "Creamy Tuscan Pasta 🍝🔥 ready in 20 minutes!": in a caption's first line an
 * emoji often ends the name and starts a tagline. Gives the two parts.
 */
function titleBeforeEmoji(raw: string): [string, string] | undefined {
  const m = /^([^\p{Extended_Pictographic}]+?)\s*\p{Extended_Pictographic}[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}\s]*(\S.*)$/u.exec(raw);
  if (!m || m[1].split(/\s+/).length < 2 || !looksLikeTitle(m[1].trim())) return undefined;
  return [m[1].trim(), dropEmoji(m[2])];
}

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
  // "Garlic Confit" on its own line between steps.
  if (section === 'method' && looksLikeStepHeading(line) && !STEP_VERB.test(line)) return line;
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

/** Words that start a step in a caption, on top of STEP_VERB. */
const CAPTION_STEP_START = new RegExp(
  String.raw`^(${STEP_VERB.source.slice(2, -3)}|air[- ]?fry|bake|fry|heat|preheat|turn|bring|boil|simmer|roast|grill|chop|slice|dice|cut|drain|remove|let|leave|top|garnish|spread|sprinkle|marinate|knead|shape|refrigerate|chill|melt|flip|repeat|enjoy|then|once|meanwhile|while|in a|on a|when|after|finally|now)\b`,
  'i',
);

/**
 * A line in a caption that starts a part of the recipe: "For the fries:",
 * "Sticky chicken:", "## Sauce" or "For the sauce".
 */
function captionHeading(line: string): string | undefined {
  let name: string | undefined;
  if (/^#+\s+/.test(line)) name = line.replace(/^#+\s+/, '');
  else if (/:$/.test(line) && line.length <= 50 && !/^\d/.test(line) && line.split(/\s+/).length <= 6) name = line;
  else if (/^for (the )?\S/i.test(line) && line.length <= 40 && !/\d/.test(line) && !/[.!?,]/.test(line)) name = line;
  if (name === undefined) return undefined;
  name = stripHeadingColon(dropEmoji(name)).replace(/^for\s+(the\s+)?/i, '').trim();
  return name ? name[0].toUpperCase() + name.slice(1) : undefined;
}

/** "Cooking instructions:", "Method", "Directions:": the steps follow. */
const isMethodHeading = (line: string) => sectionOf(line) === 'method' || partHeading(line, 'intro')?.section === 'method';

/** "Cook the noodles. Whisk the sauce, then toss." written as one paragraph: one step per sentence. */
const splitSentences = (text: string) =>
  text.split(/(?<=[a-z)][.!])\s+(?=[A-Z])/).map((t) => t.trim()).filter(Boolean);

/** "Method: Boil the pasta…": a steps heading with the first step on the same line. Gives the step. */
function inlineMethod(line: string): string | undefined {
  const m = /^([^:]{3,30}?)\s*:\s*(.{3,})$/.exec(line);
  return m && sectionOf(m[1]) === 'method' ? m[2] : undefined;
}

/** Starts with an amount or a bullet, as ingredients do. */
const startsLikeIngredient = (line: string) => STARTS_WITH_AMOUNT.test(line) || /^[-•*·]\s/.test(line);

/**
 * A caption line that says what to do rather than naming an ingredient:
 * "Cook on high heat for 6-7 mins!", "Serve over the fries", "1. Mix well".
 * An ingredient is short and starts with an amount, or is a name with a note
 * ("Chives, to garnish").
 */
function looksLikeStep(bulleted: string, afterStep: boolean): boolean {
  const line = bulleted.replace(/^[-•*·]\s*/, '');
  if (NUMBERED_STEP.test(line) && !STARTS_WITH_AMOUNT.test(line.replace(NUMBERED_STEP_NUMBER, ''))) return true;
  if (startsLikeIngredient(line)) return false;
  if (CAPTION_STEP_START.test(line)) return true;
  const words = line.split(/\s+/).length;
  if (words >= 8 || line.length > 80) return true;
  // "Enjoy!" after a step, or a short sentence such as "Bake until golden."
  return /[.!?]$/.test(dropEmoji(line)) && (words >= 4 || afterStep);
}

/**
 * A line in the ingredients that is clearly the first step: "1. Boil the pasta",
 * "Preheat the oven to 200°C." or a long sentence. Ingredient lines on recipe
 * cards are short and rarely end in a full stop, so this stays strict.
 */
function startsSteps(bulleted: string): boolean {
  const line = bulleted.replace(/^[-•*·]\s*/, '');
  if (NUMBERED_STEP.test(line)) return !STARTS_WITH_AMOUNT.test(line.replace(NUMBERED_STEP_NUMBER, ''));
  if (startsLikeIngredient(line) || /:$/.test(line)) return false;
  const words = line.split(/\s+/).length;
  if (CAPTION_STEP_START.test(line) && words >= 4) return true;
  return /[.!]$/.test(line) && words >= 6;
}

/** "200g pasta, 2 eggs, salt and pepper" written on one line: split when most pieces have an amount. */
function splitInlineList(text: string): string[] {
  const pieces = text.split(/\s*[,;]\s*(?![^()]*\))/).map((p) => p.trim()).filter(Boolean);
  const withAmount = pieces.filter((p) => STARTS_WITH_AMOUNT.test(p)).length;
  return pieces.length >= 3 && withAmount * 2 > pieces.length ? pieces : [text];
}

/**
 * "4 tbsp your favorite bbq sauce I used @sweetbabyrays - sugar free is better":
 * the cook's aside goes after a comma, so the editor keeps it as the note and
 * the name is just "favorite bbq sauce".
 */
function asideToNote(item: string): string {
  let t = item.replace(/\b(?:your|any) (favou?rite|preferred) /i, '$1 ');
  const aside = /\s+[(\[]?\s*(?=(?:i|we)\s+(?:used|use|like|love|prefer|recommend|ran|buy|bought|get|got)\b)/i.exec(t);
  if (aside && aside.index > 0 && !t.slice(0, aside.index).replace(/\([^)]*\)/g, '').includes(',')) {
    t = `${t.slice(0, aside.index)}, ${t.slice(aside.index + aside[0].length)}`.replace(/\s*[)\]]\s*$/, '');
  }
  return t.trim();
}

/**
 * Sorts the body of a recipe with no "Ingredients" heading, as most Instagram
 * captions are: parts named "For the fries:" with their ingredients under them,
 * and the steps as plain sentences, sometimes under "Cooking instructions:",
 * sometimes mixed in between the parts.
 */
function sortUnlabelledLines(rest: string[], intro: string[], ingredientLines: string[]): string[] {
  const steps: string[] = [];
  let i = 0;
  // Leading lines are the description, until the first ingredient, part heading or steps heading.
  const bodyStarts = (k: number) =>
    startsLikeIngredient(rest[k]) ||
    isMethodHeading(rest[k]) ||
    (captionHeading(rest[k]) !== undefined && rest[k + 1] !== undefined && startsLikeIngredient(rest[k + 1]));
  while (i < rest.length && !bodyStarts(i)) intro.push(rest[i++]);
  let inMethod = false;
  let afterStep = false;
  for (; i < rest.length; i++) {
    const l = rest[i];
    if (isMethodHeading(l)) {
      inMethod = true;
      continue;
    }
    const inlineStep = inlineMethod(l);
    if (inlineStep !== undefined) {
      inMethod = true;
      steps.push(...splitSentences(inlineStep));
      afterStep = true;
      continue;
    }
    const store = storageHeading(l);
    if (store) {
      steps.push(`${store}:`);
      inMethod = true;
      afterStep = false;
      continue;
    }
    const heading = captionHeading(l);
    if (heading !== undefined) {
      ingredientLines.push(`${heading}:`);
      inMethod = false;
      afterStep = false;
      continue;
    }
    if (inMethod || looksLikeStep(l, afterStep)) {
      steps.push(l);
      afterStep = true;
    } else ingredientLines.push(l);
  }
  return steps;
}

/**
 * Turns pasted recipe text into a recipe for the editor. Throws
 * NoRecipeTextError if no ingredients can be found.
 */
export function parseRecipeText(text: string, sourceUrl = ''): ImportedRecipe {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines
    .map((l) => withoutEmoji(tidy(l)))
    // Bullets and markdown emphasis people paste from notes apps.
    .map((l) => l.replace(/^\*\*(.+)\*\*$/, '$1').replace(/^__(.+)__$/, '$1'))
    .map((l) => (HASHTAG_LINE.test(l) ? '' : l.replace(TRAILING_HASHTAGS, '')));
  const joined = joinBrokenBullets(lines);
  /** The next line with words on it, for spotting a heading over a list. */
  const nextLine = (k: number) => {
    for (let n = k + 1; n < lines.length; n++) if (lines[n] && !joined.has(n)) return lines[n];
    return undefined;
  };

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

  // With no "Ingredients" heading anywhere (as in most Instagram captions), the
  // whole recipe is sorted line by line at the end, so a steps heading in the
  // middle mustn't swallow the parts that come after it.
  const unlabelled = !lines.some((l) => l && (sectionOf(l) === 'ingredients' || partHeading(l, 'intro')?.section === 'ingredients'));
  /** In an unlabelled recipe, the ingredients or steps have started: no more title or details. */
  let bodyStarted = false;
  /** A steps heading or step has been read, so a notes paragraph stays a note. */
  let sawMethod = false;

  for (let index = 0; index < lines.length; index++) {
    if (joined.has(index)) continue;
    if (section === 'method') sawMethod = true;
    const raw = lines[index];
    const afterBlank = index === 0 || !lines[index - 1];
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
    if (MACROS.test(line)) {
      // "(x3 servings)" in the macros is how many the recipe makes.
      const serves = /\bx\s*(\d+)\s*servings?\b|\b(?:makes|serves)\s*(\d+)\b|\b(\d+)\s*servings\b/i.exec(line);
      if (serves && details.servings == null) details.servings = Number(serves[1] ?? serves[2] ?? serves[3]);
      continue;
    }
    // "Ingredients (serves 2)" or "Ingredients for 4 people": a heading, and how many it serves.
    const serves = /\s*[(\[\-–—|,]?\s*(?:serves|servings?|makes|for)\s*:?\s*(\d+)(?:\s*(?:people|persons|servings|portions))?\s*[)\]]?\s*:?$/i.exec(line);
    if (serves && serves.index > 0 && sectionOf(line.slice(0, serves.index))) {
      if (details.servings == null) details.servings = Number(serves[1]);
      line = line.slice(0, serves.index);
    }
    const part: ReturnType<typeof partHeading> = section === 'skip' ? undefined : partHeading(line, section);
    if (section === 'intro' && unlabelled && bodyStarted && (part?.section === 'method' || isMethodHeading(line) || inlineMethod(line) !== undefined)) {
      intro.push(line);
      continue;
    }
    if (part) {
      section = part.section;
      if (part.section === 'ingredients') {
        sawIngredientsHeading = true;
        ingredientLines.push(`${part.part}:`);
      } else methodLines.push(`${part.part}:`);
      pendingLabel = undefined;
      continue;
    }
    // "Ingredients: 200g pasta, 2 eggs, 50g parmesan" or "Method: Boil the pasta…" on one line.
    const inline = /^([^:]{3,30}?)\s*[:\-–—]\s*(.{3,})$/.exec(line);
    const inlineSection = inline ? sectionOf(inline[1]) : undefined;
    if (inline && (inlineSection === 'ingredients' || inlineSection === 'method' || inlineSection === 'notes')) {
      section = inlineSection;
      pendingLabel = undefined;
      if (inlineSection === 'ingredients') {
        sawIngredientsHeading = true;
        ingredientLines.push(...splitInlineList(inline[2]));
      } else if (inlineSection === 'method') methodLines.push(...splitSentences(inline[2]));
      else notes.push(inline[2]);
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
    // "Storage & Heating" after the recipe: how to keep and reheat it, as steps under that heading.
    const storage = section === 'intro' ? undefined : storageHeading(line);
    if (storage) {
      section = 'method';
      sawMethod = true;
      methodLines.push(`${storage}:`);
      continue;
    }
    // A paragraph after the notes that says what to do ("Place in a pan…") when no steps have
    // come yet: the cook put the method below their tips, without a heading.
    if (section === 'notes' && sawIngredientsHeading && !sawMethod && afterBlank && !/^[-•*·]\s/.test(line) && startsSteps(line)) {
      section = 'method';
    }
    // "Garlic butter (optional)" over a bulleted list: a part of the ingredients, with no colon.
    if (
      section === 'ingredients' &&
      afterBlank &&
      line.length <= 50 &&
      line.split(/\s+/).length <= 6 &&
      !startsLikeIngredient(line) &&
      !/[.!?,;]$/.test(line) &&
      /^[-•*·]\s/.test(nextLine(index) ?? '')
    ) {
      ingredientLines.push(`${stripHeadingColon(line)}:`);
      continue;
    }
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

    if (section === 'intro' && unlabelled) {
      const startsBody =
        captionHeading(line) !== undefined ||
        /^[-•*·]\s/.test(line) ||
        // An amount on the first line is the name: "5 Minute Pasta".
        (/^(\d|[½⅓⅔¼¾⅛⅜⅝⅞])/.test(line) && (title !== '' || intro.length > 0));
      if (bodyStarted || startsBody) {
        bodyStarted = true;
        intro.push(line);
        continue;
      }
    }
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
      const split = !title && !intro.length && !looksLikeTitle(line) ? titleBeforeEmoji(tidy(rawLines[index])) : undefined;
      if (split) {
        title = split[0];
        intro.push(split[1][0].toUpperCase() + split[1].slice(1));
        continue;
      }
      // "High Protein Cheesy Garlic Naans!": a name said with excitement on the first line.
      const exclaimed = line.replace(/\s*!+$/, '');
      if (!title && !intro.length && exclaimed !== line && exclaimed.split(/\s+/).length <= 8 && looksLikeTitle(exclaimed)) {
        title = exclaimed;
        continue;
      }
      if (!title && looksLikeTitle(line)) {
        title = line
          .replace(/[\s\p{Extended_Pictographic}\u{FE0F}\u{200D}]+$/u, '')
          .replace(/\s+recipe$/i, '')
          .trim();
        // "Garlic butter prawns (serves 2)"
        const serves = /\s*[(\[|\-–—]\s*(?:serves|makes|for)\s*(\d+)[^)\]]{0,20}[)\]]?$/i.exec(title);
        if (serves && serves.index > 0) {
          if (details.servings == null) details.servings = Number(serves[1]);
          title = title.slice(0, serves.index).trim();
        }
        continue;
      }
      intro.push(line);
      continue;
    }
    // Steps straight after the ingredients, with no Method heading: numbered, or plain sentences in a caption.
    if (section === 'ingredients' && startsSteps(line)) section = 'method';
    if (section === 'ingredients') ingredientLines.push(line);
    else if (section === 'method') {
      methodLines.push(line);
      sawMethod = true;
    }
    else if (section === 'notes') notes.push(line);
  }

  // No "Ingredients" heading: take short lines that start with an amount as ingredients, and the rest as steps.
  if (!sawIngredientsHeading) methodLines.unshift(...sortUnlabelledLines(intro.splice(0), intro, ingredientLines));

  const ingredients: ImportedIngredientGroup[] = [{ items: [] }];
  for (const l of joinBrokenIngredients(ingredientLines)) {
    const h = subHeading(l, 'ingredients');
    if (h !== undefined) ingredients.push({ heading: h || undefined, items: [] });
    else {
      const items = splitIngredientList(dropEmoji(l.replace(/^[-•*·]\s*/, '')))
        .map(asideToNote)
        .filter(Boolean);
      ingredients[ingredients.length - 1].items.push(...items);
    }
  }

  const instructions: ImportedStepGroup[] = [{ steps: [] }];
  for (const l of methodLines) {
    const h = subHeading(l, 'method');
    if (h !== undefined) instructions.push({ heading: h || undefined, steps: [] });
    else {
      const step = dropEmoji(stripStepNumber(l.replace(/^[-•*·]\s*/, '')));
      if (step) instructions[instructions.length - 1].steps.push(step);
    }
  }

  // A last "heading" with no steps under it was a short step, such as "Enjoy".
  const lastStepGroup = instructions[instructions.length - 1];
  if (instructions.length > 1 && !lastStepGroup.steps.length && lastStepGroup.heading) {
    instructions.pop();
    instructions[instructions.length - 1].steps.push(lastStepGroup.heading);
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
