/**
 * Finding the recipe in a web page. Recipe sites wrap the recipe in a lot of
 * story, ads and comments, so we look for it in this order:
 *
 * 1. schema.org Recipe data (JSON-LD), which most recipe sites embed for
 *    Google. It has the name, servings, times, ingredients and steps.
 * 2. The recipe card plugins most food blogs use (WP Recipe Maker, Tasty
 *    Recipes), read for ingredient sections and notes that JSON-LD leaves out.
 * 3. schema.org microdata (itemprop="recipeIngredient").
 * 4. As a last resort, the lists under headings such as "Ingredients" and
 *    "Method".
 *
 * Runs in the app (Android) and in the web import helper (Supabase Edge Function), so it must not
 * use the DOM or relative-path aliases.
 */
import { parse, type HTMLElement, NodeType, type Node } from 'node-html-parser';

export interface ImportedIngredientGroup {
  /** Section heading such as "Cheesecake filling", or undefined for the main list. */
  heading?: string;
  /** Lines as written, e.g. "1 1/2 cups (225g) plain flour". */
  items: string[];
}

export interface ImportedStepGroup {
  heading?: string;
  steps: string[];
}

export interface ImportedRecipe {
  title: string;
  description?: string;
  /** The first number in the recipe's yield ("8 slices" gives 8). */
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: ImportedIngredientGroup[];
  instructions: ImportedStepGroup[];
  notes?: string;
  tags: string[];
  imageUrl?: string;
  sourceUrl: string;
  /** Which method found it, for troubleshooting. */
  foundBy: 'json-ld' | 'recipe-card' | 'microdata' | 'headings' | 'pasted' | 'ai';
}

export class NoRecipeFoundError extends Error {
  constructor() {
    super("Couldn't find a recipe on that page.");
    this.name = 'NoRecipeFoundError';
  }
}

/** Text with tags removed, entities decoded and whitespace tidied. */
export function cleanText(s: unknown): string {
  if (s == null) return '';
  let t = String(s);
  if (/[<&]/.test(t)) t = parse(`<div>${t}</div>`).text;
  return tidy(t);
}

const tidy = (t: string) =>
  t
    .replace(/[   ]/g, ' ')
    // Tick boxes recipe cards put in front of each ingredient.
    .replace(/[▢☐□✓✔]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const elText = (el: HTMLElement) => tidy(el.text);

const asArray = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Minutes in an ISO 8601 duration such as "PT1H20M" or "P0DT0H45M". */
export function parseDuration(v: unknown): number | undefined {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : undefined;
  if (typeof v !== 'string') return undefined;
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(v.trim());
  if (!m) return undefined;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  const total = Math.round(d * 1440 + h * 60 + min + s / 60);
  return total > 0 ? total : undefined;
}

/** The first number in a yield: 8, "8", "8 slices", ["8", "8 slices"], "Serves 4-6". */
export function parseYield(v: unknown): number | undefined {
  for (const item of asArray(v as unknown)) {
    if (typeof item === 'number' && item > 0) return item;
    const m = /(\d+(?:\.\d+)?)/.exec(cleanText(item));
    if (m && Number(m[1]) > 0) return Number(m[1]);
  }
  return undefined;
}

// ---------------------------------------------------------------- JSON-LD

type Json = Record<string, unknown>;

function parseJsonLoosely(raw: string): unknown {
  const text = raw.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    // Some sites leave raw line breaks or tabs inside strings.
    try {
      return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return undefined;
    }
  }
}

const hasType = (o: Json, type: string) =>
  asArray(o['@type'] as string | string[]).some((t) => typeof t === 'string' && t.toLowerCase() === type.toLowerCase());

/** The first schema.org Recipe anywhere in the JSON (inside @graph, arrays or mainEntity). */
function findRecipeObject(node: unknown, depth = 0): Json | undefined {
  if (!node || typeof node !== 'object' || depth > 8) return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipeObject(n, depth + 1);
      if (r) return r;
    }
    return undefined;
  }
  const o = node as Json;
  if (hasType(o, 'Recipe')) return o;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipeObject(o[k], depth + 1);
    if (r) return r;
  }
  return undefined;
}

function jsonLdRecipe(root: HTMLElement): Json | undefined {
  for (const script of root.querySelectorAll('script')) {
    if (!/ld\+json/i.test(script.getAttribute('type') ?? '')) continue;
    const r = findRecipeObject(parseJsonLoosely(script.rawText));
    if (r) return r;
  }
  return undefined;
}

/** Steps from recipeInstructions, which comes as text, a list of strings, HowToSteps or HowToSections. */
function jsonLdInstructions(v: unknown): ImportedStepGroup[] {
  const groups: ImportedStepGroup[] = [{ steps: [] }];
  const current = () => groups[groups.length - 1];
  const visit = (node: unknown, depth: number) => {
    if (node == null || depth > 6) return;
    if (typeof node === 'string') {
      // A single block of text: split it into steps on list items, paragraphs or line breaks.
      let parts: string[] = node.split(/\r?\n/);
      if (/<[a-z]/i.test(node)) {
        const div = parse(`<div>${node.replace(/<br\s*\/?>/gi, '\n')}</div>`);
        const blocks = div.querySelectorAll('li, p');
        parts = blocks.length ? blocks.map((b) => b.text) : div.text.split('\n');
      }
      for (const p of parts.map(cleanText).filter(Boolean)) current().steps.push(stripStepNumber(p));
      return;
    }
    if (Array.isArray(node)) {
      for (const n of node) visit(n, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Json;
    if (hasType(o, 'HowToSection') || (o.itemListElement && !o.text)) {
      groups.push({ heading: cleanText(o.name).replace(/:+$/, '').trim() || undefined, steps: [] });
      visit(o.itemListElement, depth + 1);
      // Steps after a section belong to no section.
      groups.push({ steps: [] });
      return;
    }
    const text = cleanText(o.text) || cleanText(o.name) || cleanText(o.description);
    if (text) current().steps.push(stripStepNumber(text));
  };
  visit(v, 0);
  return groups.filter((g) => g.steps.length);
}

const stripStepNumber = (s: string) => s.replace(/^(step\s*)?\d+[.):]\s+/i, '').trim();

function imageUrl(v: unknown): string | undefined {
  for (const item of asArray(v as unknown)) {
    if (typeof item === 'string' && item) return item;
    if (item && typeof item === 'object') {
      const url = (item as Json).url ?? (item as Json)['@id'];
      if (typeof url === 'string' && url) return url;
    }
  }
  return undefined;
}

const tagList = (...values: unknown[]) => {
  const tags = values
    .flatMap((v) => asArray(v as unknown))
    .flatMap((v) => cleanText(v).split(','))
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && t.length <= 30);
  return [...new Set(tags)];
};

// ------------------------------------------------------- Recipe card plugins

/** Ingredient sections, steps and notes from a WP Recipe Maker or Tasty Recipes card, if the page has one. */
function recipeCard(root: HTMLElement): {
  ingredients?: ImportedIngredientGroup[];
  instructions?: ImportedStepGroup[];
  notes?: string;
} {
  // WP Recipe Maker (RecipeTin Eats and many others). Pages can repeat the card (e.g. a print copy); use the first.
  const wprm = root.querySelector('.wprm-recipe-container') ?? root.querySelector('.wprm-recipe');
  if (wprm) {
    const ingredients = wprm.querySelectorAll('.wprm-recipe-ingredient-group').map((g) => ({
      heading: cardHeading(g, '.wprm-recipe-group-name'),
      items: g.querySelectorAll('.wprm-recipe-ingredient').map(wprmIngredient).filter(Boolean),
    }));
    const instructions = wprm.querySelectorAll('.wprm-recipe-instruction-group').map((g) => ({
      heading: cardHeading(g, '.wprm-recipe-group-name'),
      steps: g
        .querySelectorAll('.wprm-recipe-instruction')
        .map((s) => elText(s.querySelector('.wprm-recipe-instruction-text') ?? s))
        .filter(Boolean),
    }));
    const notesEl = wprm.querySelector('.wprm-recipe-notes');
    return {
      ingredients: nonEmpty(ingredients.filter((g) => g.items.length)),
      instructions: nonEmpty(instructions.filter((g) => g.steps.length)),
      notes: notesEl ? blockText(notesEl) : undefined,
    };
  }
  const tasty = root.querySelector('.tasty-recipes');
  if (tasty) {
    const ing = tasty.querySelector('.tasty-recipes-ingredients');
    const ins = tasty.querySelector('.tasty-recipes-instructions');
    const notesEl = tasty.querySelector('.tasty-recipes-notes');
    return {
      ingredients: ing ? nonEmpty(sectionsByHeading(ing).map((s) => ({ heading: s.heading, items: s.items }))) : undefined,
      instructions: ins ? nonEmpty(sectionsByHeading(ins).map((s) => ({ heading: s.heading, steps: s.items }))) : undefined,
      notes: notesEl ? blockText(notesEl) : undefined,
    };
  }
  return {};
}

/**
 * A WP Recipe Maker ingredient as one line, from its amount, unit, name and
 * notes parts, with the notes after a comma so they land in the note.
 */
function wprmIngredient(li: HTMLElement): string {
  const part = (name: string) => {
    const el = li.querySelector(`.wprm-recipe-ingredient-${name}`);
    return el ? elText(el) : '';
  };
  const name = part('name');
  if (!name) return elText(li);
  let notes = part('notes').replace(/^[,;\s]+/, '');
  // "(unflavoured gelatine) (Note 2)" reads better as "unflavoured gelatine, Note 2".
  notes = notes.replace(/\)\s*\(/g, ', ');
  if (/^\([^()]*\)$/.test(notes)) notes = notes.slice(1, -1).trim();
  const main = [part('amount'), part('unit'), name].filter(Boolean).join(' ');
  return notes ? `${main}, ${notes}` : main;
}

const nonEmpty = <T>(list: T[]) => (list.length ? list : undefined);

const cardHeading = (group: HTMLElement, selector: string) => {
  const el = group.querySelector(selector);
  return el ? elText(el).replace(/:$/, '').trim() || undefined : undefined;
};

/** Text of a block with one line per paragraph or list item. */
function blockText(el: HTMLElement): string | undefined {
  const parts = el.querySelectorAll('p, li, h3, h4, h5');
  const lines = (parts.length ? parts : [el])
    .filter((p) => !parts.some((q) => q !== p && q.querySelectorAll('*').includes(p)))
    .map(elText)
    .filter((t) => t && !/^notes?:?$/i.test(t));
  return lines.join('\n') || undefined;
}

/** Splits a container into lists under its sub-headings. */
function sectionsByHeading(container: HTMLElement): Array<{ heading?: string; items: string[] }> {
  const sections: Array<{ heading?: string; items: string[] }> = [{ items: [] }];
  for (const ev of flatten(container)) {
    if (ev.kind === 'heading') sections.push({ heading: ev.text.replace(/:$/, '') || undefined, items: [] });
    else if (ev.kind === 'li') sections[sections.length - 1].items.push(ev.text);
  }
  return sections.filter((s) => s.items.length);
}

// ------------------------------------------------------------- Microdata

function microdata(root: HTMLElement): Partial<ImportedRecipe> | undefined {
  const scope = root.querySelector('[itemtype*="schema.org/Recipe"]') ?? root;
  const items = scope.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]').map(elText).filter(Boolean);
  if (!items.length) return undefined;
  const stepEls = scope.querySelectorAll('[itemprop="recipeInstructions"]');
  const steps = stepEls.flatMap((el) => {
    const lis = el.querySelectorAll('li');
    return lis.length ? lis.map(elText) : el.text.split(/\n+/).map(tidy);
  });
  const prop = (name: string) => {
    const el = scope.querySelector(`[itemprop="${name}"]`);
    return el ? el.getAttribute('content') ?? el.getAttribute('datetime') ?? elText(el) : undefined;
  };
  return {
    title: cleanText(prop('name')),
    description: cleanText(prop('description')) || undefined,
    servings: parseYield(prop('recipeYield')),
    prepMinutes: parseDuration(prop('prepTime')),
    cookMinutes: parseDuration(prop('cookTime')),
    ingredients: [{ items }],
    instructions: [{ steps: steps.map(stripStepNumber).filter(Boolean) }].filter((g) => g.steps.length),
  };
}

// ------------------------------------------------------------- Headings

type FlatEvent = { kind: 'heading'; level: number; text: string } | { kind: 'li' | 'p'; text: string };

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'nav', 'footer', 'header', 'aside', 'form', 'svg', 'iframe', 'button', 'select']);

/** The page as a flat run of headings, list items and paragraphs, in reading order. */
function flatten(root: HTMLElement): FlatEvent[] {
  const out: FlatEvent[] = [];
  const walk = (node: Node) => {
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = (el.rawTagName ?? '').toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (/comment|sidebar|related|share|newsletter/i.test(el.getAttribute('class') ?? '') && tag !== 'body') return;
    const h = /^h([1-6])$/.exec(tag);
    if (h) {
      const text = elText(el);
      if (text) out.push({ kind: 'heading', level: Number(h[1]), text });
      return;
    }
    if (tag === 'li' || tag === 'p') {
      // A paragraph that is just bold text works as a heading on many blogs.
      const only = el.childNodes.filter((c) => c.nodeType === NodeType.ELEMENT_NODE || c.text.trim());
      const text = elText(el);
      if (tag === 'p' && only.length === 1 && /^(strong|b)$/i.test((only[0] as HTMLElement).rawTagName ?? '') && text.length < 60) {
        out.push({ kind: 'heading', level: 7, text });
      } else if (text) out.push({ kind: tag, text });
      return;
    }
    for (const c of el.childNodes) walk(c);
  };
  walk(root);
  return out;
}

const INGREDIENTS_HEADING = /^(the\s+)?ingredients?\b|^what you('ll)? need\b|^you('ll)? need\b/i;
const METHOD_HEADING = /^(the\s+)?(instructions?|method|directions?|steps|preparation|how to make( it)?)\b/i;

/** Lists under each matching heading, split by smaller sub-headings. Picks the heading with the most items. */
function listsUnder(events: FlatEvent[], heading: RegExp, take: 'li' | 'li-or-p') {
  let best: Array<{ heading?: string; items: string[] }> = [];
  const count = (s: typeof best) => s.reduce((n, x) => n + x.items.length, 0);
  events.forEach((ev, i) => {
    if (ev.kind !== 'heading' || !heading.test(ev.text)) return;
    const sections: typeof best = [{ items: [] }];
    const paragraphs: typeof best = [{ items: [] }];
    for (let j = i + 1; j < events.length; j++) {
      const e = events[j];
      if (e.kind === 'heading') {
        if (e.level <= ev.level || INGREDIENTS_HEADING.test(e.text) || METHOD_HEADING.test(e.text) || /^notes?\b/i.test(e.text)) break;
        sections.push({ heading: e.text.replace(/:$/, ''), items: [] });
        paragraphs.push({ heading: e.text.replace(/:$/, ''), items: [] });
      } else if (e.kind === 'li') sections[sections.length - 1].items.push(e.text);
      else paragraphs[paragraphs.length - 1].items.push(e.text);
    }
    let found = sections.filter((s) => s.items.length);
    if (!count(found) && take === 'li-or-p') found = paragraphs.filter((s) => s.items.length);
    if (count(found) > count(best)) best = found;
  });
  return best;
}

function byHeadings(root: HTMLElement): Partial<ImportedRecipe> | undefined {
  const events = flatten(root.querySelector('body') ?? root);
  const ingredients = listsUnder(events, INGREDIENTS_HEADING, 'li');
  if (!ingredients.length) return undefined;
  const instructions = listsUnder(events, METHOD_HEADING, 'li-or-p').map((s) => ({
    heading: s.heading,
    steps: s.items.map(stripStepNumber).filter(Boolean),
  }));
  const bodyText = tidy(root.querySelector('body')?.text ?? '');
  const serves = /\b(?:serves|servings|yield|makes)\s*:?\s*(\d+)/i.exec(bodyText);
  return {
    ingredients: ingredients.map((s) => ({ heading: s.heading, items: s.items })),
    instructions,
    servings: serves ? Number(serves[1]) : undefined,
  };
}

// ------------------------------------------------------------- Putting it together

function meta(root: HTMLElement, name: string): string | undefined {
  const el = root.querySelector(`meta[property="${name}"]`) ?? root.querySelector(`meta[name="${name}"]`);
  return cleanText(el?.getAttribute('content')) || undefined;
}

function pageTitle(root: HTMLElement): string {
  const h1 = root.querySelector('h1');
  return (
    meta(root, 'og:title') ??
    (h1 ? elText(h1) : undefined) ??
    cleanText(root.querySelector('title')?.text).replace(/\s*[|–-][^|–-]*$/, '')
  );
}

/** Resolves a possibly relative image link against the page address. */
function absolute(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, base).toString();
  } catch {
    return undefined;
  }
}

/** Finds the recipe in a page's HTML. Throws NoRecipeFoundError if there isn't one. */
export function extractRecipe(html: string, sourceUrl: string): ImportedRecipe {
  const root = parse(html, { blockTextElements: { script: true, style: false, noscript: false, pre: true } });
  const card = recipeCard(root);
  const ld = jsonLdRecipe(root);

  if (ld) {
    const flat = asArray(ld.recipeIngredient ?? ld.ingredients).map(cleanText).filter(Boolean);
    const prep = parseDuration(ld.prepTime);
    let cook = parseDuration(ld.cookTime);
    const total = parseDuration(ld.totalTime);
    if (cook == null && total != null) cook = prep != null && total > prep ? total - prep : prep == null ? total : undefined;
    const ldSteps = jsonLdInstructions(ld.recipeInstructions);
    const cardCount = (card.ingredients ?? []).reduce((n, g) => n + g.items.length, 0);
    const recipe: ImportedRecipe = {
      title: cleanText(ld.name) || pageTitle(root),
      description: cleanText(ld.description) || undefined,
      servings: parseYield(ld.recipeYield),
      prepMinutes: prep,
      cookMinutes: cook,
      // The card has the same ingredients with their sections; prefer it when it holds at least as many.
      ingredients: card.ingredients && cardCount >= flat.length ? card.ingredients : [{ items: flat }],
      instructions: ldSteps.length ? ldSteps : (card.instructions ?? []),
      notes: card.notes,
      tags: tagList(ld.recipeCategory, ld.recipeCuisine),
      imageUrl: absolute(imageUrl(ld.image) ?? meta(root, 'og:image'), sourceUrl),
      sourceUrl,
      foundBy: 'json-ld',
    };
    // JSON-LD loses step sections; the card keeps them.
    if (card.instructions && card.instructions.length > 1 && recipe.instructions.length <= 1) {
      recipe.instructions = card.instructions;
    }
    if (recipe.ingredients.some((g) => g.items.length)) return recipe;
  }

  const micro = microdata(root);
  const [result, foundBy]: [Partial<ImportedRecipe> | undefined, ImportedRecipe['foundBy']] = micro
    ? [micro, 'microdata']
    : card.ingredients
      ? [{ ingredients: card.ingredients, instructions: card.instructions }, 'recipe-card']
      : [byHeadings(root), 'headings'];
  if (!result?.ingredients?.length) throw new NoRecipeFoundError();
  return {
    title: result.title || pageTitle(root),
    description: result.description ?? meta(root, 'og:description') ?? meta(root, 'description'),
    servings: result.servings,
    prepMinutes: result.prepMinutes,
    cookMinutes: result.cookMinutes,
    ingredients: result.ingredients,
    instructions: result.instructions ?? [],
    notes: result.notes ?? card.notes,
    tags: [],
    imageUrl: absolute(meta(root, 'og:image'), sourceUrl),
    sourceUrl,
    foundBy,
  };
}
