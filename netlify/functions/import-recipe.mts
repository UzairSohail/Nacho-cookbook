/**
 * GET /.netlify/functions/import-recipe?url=<recipe page>
 *
 * Fetches a recipe page for the web app (browsers can't read other sites'
 * pages) and returns only the recipe found in it, as { recipe }, or
 * { error, code } with a message to show.
 */
import { extractRecipe, NoRecipeFoundError } from '../../src/core/recipeImport';
import { fetchPage, ImportError, NO_RECIPE_MESSAGE } from '../../src/import/pageFetch';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default async (req: Request) => {
  if (req.method !== 'GET') return json({ error: 'Use GET.', code: 'bad-url' }, 405);
  const target = new URL(req.url).searchParams.get('url');
  if (!target) return json({ error: 'Give a recipe address.', code: 'bad-url' }, 400);
  try {
    const page = await fetchPage(target);
    return json({ recipe: extractRecipe(page.html, page.url) });
  } catch (e) {
    if (e instanceof NoRecipeFoundError) return json({ error: NO_RECIPE_MESSAGE, code: 'no-recipe' }, 422);
    if (e instanceof ImportError) return json({ error: e.message, code: e.code }, e.code === 'bad-url' ? 400 : 502);
    console.error('import-recipe failed', target, e);
    return json({ error: 'Something went wrong reading that page.', code: 'unreachable' }, 500);
  }
};
