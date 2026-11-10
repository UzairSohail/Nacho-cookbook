/**
 * The web app's recipe import helper, run as the Supabase Edge Function
 * "import-recipe" (browsers can't read other sites' pages, so the web app asks
 * this helper to fetch the page and find the recipe).
 *
 * POST { url } (or GET ?url=) → { recipe }, or { error, code } with a message to show.
 * Bundled into supabase/functions/import-recipe/index.ts by `npm run build:import-function`.
 */
import { extractRecipe, NoRecipeFoundError } from '@/src/core/recipeImport';
import { fetchPage, ImportError, NO_RECIPE_MESSAGE } from './pageFetch';

// The web app is on another address (GitHub Pages), so the browser needs these.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function targetOf(req: Request): Promise<string | null> {
  if (req.method === 'GET') return new URL(req.url).searchParams.get('url');
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  return typeof body?.url === 'string' ? body.url : null;
}

export async function handleImport(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Use POST.', code: 'bad-url' }, 405);
  const target = await targetOf(req);
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
}
