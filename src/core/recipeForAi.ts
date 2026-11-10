/**
 * Getting a web page's recipe ready for AI sorting, and combining the AI's
 * answer with what the page's own recipe data says.
 *
 * When the page has recipe data (found by extractRecipe), the AI tidies that
 * recipe, written out as text. When it has none, the AI reads the page's
 * words. Details the AI can't see or shouldn't guess (photo, address, tags,
 * times and servings from the recipe data) are kept from the page.
 *
 * Runs in the app (Android) and in the web import helper, so no DOM here.
 */
import { parse } from 'node-html-parser';

import type { ImportedRecipe } from './recipeImport';

/** Most text sent for one recipe (matches the import helper's limit). */
export const MAX_AI_TEXT = 20_000;

/** A found recipe written out as plain text, with its sections, for the AI to tidy. */
export function recipeAsText(r: ImportedRecipe): string {
  const out: string[] = [r.title];
  if (r.description) out.push(r.description);
  if (r.servings) out.push(`Serves ${r.servings}`);
  if (r.prepMinutes) out.push(`Prep time: ${r.prepMinutes} minutes`);
  if (r.cookMinutes) out.push(`Cook time: ${r.cookMinutes} minutes`);
  out.push('', 'Ingredients');
  for (const g of r.ingredients) {
    if (g.heading) out.push('', `${g.heading}:`);
    out.push(...g.items.map((i) => `- ${i}`));
  }
  if (r.instructions.length) {
    out.push('', 'Method');
    let n = 0;
    for (const g of r.instructions) {
      if (g.heading) out.push('', `${g.heading}:`);
      out.push(...g.steps.map((s) => `${++n}. ${s}`));
    }
  }
  if (r.notes) out.push('', 'Notes', r.notes);
  return out.join('\n').slice(0, MAX_AI_TEXT);
}

const NOT_CONTENT = 'script, style, noscript, svg, iframe, nav, header, footer, aside, form, button, template, [aria-hidden="true"], .comments, #comments';

/**
 * The words on a page with no recipe data, for the AI to find the recipe in.
 * Long food-blog pages are cut to the part from just before "Ingredients".
 */
export function pageText(html: string): string {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const main = root.querySelector('main') ?? root.querySelector('article') ?? root.querySelector('body') ?? root;
  for (const el of main.querySelectorAll(NOT_CONTENT)) el.remove();
  const title = root.querySelector('h1')?.text.trim() ?? root.querySelector('title')?.text.trim() ?? '';
  const text = main.structuredText
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  if (text.length <= MAX_AI_TEXT) return text;
  const at = text.search(/\bingredients\b/i);
  const start = at < 0 ? 0 : Math.max(0, at - 1500);
  const body = text.slice(start, start + MAX_AI_TEXT - title.length - 2);
  return start > 0 && title ? `${title}\n\n${body}` : body;
}

/**
 * The AI's recipe, with the page's photo, address and tags, and the recipe
 * data's own numbers where it had them.
 */
export function withPageDetails(ai: ImportedRecipe, page: ImportedRecipe | null, sourceUrl: string): ImportedRecipe {
  return {
    ...ai,
    title: ai.title && ai.title !== 'Pasted recipe' ? ai.title : (page?.title ?? ai.title),
    description: page?.description ?? ai.description,
    servings: page?.servings ?? ai.servings,
    prepMinutes: page?.prepMinutes ?? ai.prepMinutes,
    cookMinutes: page?.cookMinutes ?? ai.cookMinutes,
    tags: page?.tags ?? ai.tags,
    imageUrl: page?.imageUrl ?? ai.imageUrl,
    sourceUrl: page?.sourceUrl || sourceUrl,
    foundBy: 'ai',
  };
}
