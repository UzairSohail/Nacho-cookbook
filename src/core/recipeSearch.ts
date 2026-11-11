import type { Recipe } from './types';

/**
 * Recipes matching what someone has typed so far, best first: titles that
 * start with it, then titles with a word starting with it, then titles that
 * contain it anywhere, then recipes whose tags or ingredients mention it.
 * `ingredientName` looks up an ingredient's name by id (optional).
 */
export function searchRecipes(
  query: string,
  recipes: readonly Recipe[],
  ingredientName?: (id: string) => string | undefined,
  limit = Infinity,
): Recipe[] {
  const q = normalise(query);
  if (!q) return [];
  const scored: { recipe: Recipe; rank: number }[] = [];
  for (const recipe of recipes) {
    const title = normalise(recipe.title);
    let rank: number;
    if (title.startsWith(q)) rank = 0;
    else if (title.split(' ').some((w) => w.startsWith(q))) rank = 1;
    else if (title.includes(q)) rank = 2;
    else if (recipe.tags?.some((t) => normalise(t).includes(q))) rank = 3;
    else if (ingredientName && recipe.ingredients.some((i) => normalise(ingredientName(i.ingredientId) ?? '').includes(q))) rank = 4;
    else continue;
    scored.push({ recipe, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.recipe.title.localeCompare(b.recipe.title));
  return scored.slice(0, limit).map((s) => s.recipe);
}

function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
