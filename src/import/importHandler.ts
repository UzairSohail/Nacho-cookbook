/**
 * The web app's recipe import helper, run as the Supabase Edge Function
 * "import-recipe" (browsers can't read other sites' pages, so the web app asks
 * this helper to fetch the page and find the recipe).
 *
 * POST { url } (or GET ?url=) → { recipe }, or { error, code } with a message to show.
 * POST { text, sourceUrl? } → { recipe } sorted by AI (Gemini, see aiSort.ts), for
 * signed-in people only. The app falls back to its own rules when this fails.
 * Bundled into supabase/functions/import-recipe/index.ts by `npm run build:import-function`.
 */
import { extractRecipe, NoRecipeFoundError } from '@/src/core/recipeImport';
import { AiSortError, MAX_TEXT_LENGTH, sortWithGemini } from './aiSort';
import { fetchPage, ImportError, NO_RECIPE_MESSAGE } from './pageFetch';

/** Edge Function settings and secrets (Deno), undefined when run elsewhere. */
const env = (name: string): string | undefined =>
  (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(name) || undefined;

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

type RequestBody = { url?: unknown; text?: unknown; sourceUrl?: unknown } | null;

/**
 * True when the request comes from someone signed in to the app (not just the
 * public app key), so strangers can't use up the household's AI allowance.
 */
export async function isSignedIn(req: Request, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const auth = req.headers.get('authorization');
  const supabaseUrl = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  if (!auth || !supabaseUrl || !anonKey) return false;
  try {
    const res = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers: { authorization: auth, apikey: anonKey } });
    if (!res.ok) return false;
    const user = (await res.json().catch(() => null)) as { id?: string } | null;
    return typeof user?.id === 'string';
  } catch {
    return false;
  }
}

async function sortText(req: Request, body: { text: string; sourceUrl?: unknown }): Promise<Response> {
  if (!(await isSignedIn(req))) return json({ error: 'Sign in to sort recipes with AI.', code: 'signed-out' }, 401);
  const text = body.text.trim();
  if (!text) return json({ error: 'Paste the recipe first.', code: 'no-recipe' }, 400);
  if (text.length > MAX_TEXT_LENGTH) return json({ error: 'That text is too long to be one recipe.', code: 'too-long' }, 413);
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : '';
  try {
    const recipe = await sortWithGemini(text, sourceUrl, { apiKey: env('GEMINI_API_KEY'), model: env('GEMINI_MODEL') });
    return json({ recipe });
  } catch (e) {
    const code = e instanceof AiSortError ? e.code : 'failed';
    if (code === 'failed') console.error('AI sort failed', e);
    const status = code === 'no-recipe' ? 422 : code === 'busy' ? 429 : code === 'not-configured' ? 503 : 502;
    return json({ error: e instanceof AiSortError ? e.message : 'AI sorting failed.', code }, status);
  }
}

export async function handleImport(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Use POST.', code: 'bad-url' }, 405);
  const body: RequestBody = req.method === 'POST' ? ((await req.json().catch(() => null)) as RequestBody) : null;
  if (typeof body?.text === 'string') return sortText(req, { text: body.text, sourceUrl: body.sourceUrl });
  const target = req.method === 'GET' ? new URL(req.url).searchParams.get('url') : typeof body?.url === 'string' ? body.url : null;
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
