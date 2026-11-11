/**
 * The web app's recipe import helper, run as the Supabase Edge Function
 * "import-recipe" (browsers can't read other sites' pages, so the web app asks
 * this helper to fetch the page and find the recipe).
 *
 * POST { url } (or GET ?url=) → { recipe }, or { error, code } with a message to show.
 * For signed-in people the page's recipe is then tidied by AI (or, with no
 * recipe data on the page, found in the page's words by AI).
 * POST { text, sourceUrl? } → { recipe } sorted by AI (Gemini, see aiSort.ts), for
 * signed-in people only. The app falls back to its own rules when this fails.
 * Bundled into supabase/functions/import-recipe/index.ts by `npm run build:import-function`.
 */
import { pageText, recipeAsText, withPageDetails } from '@/src/core/recipeForAi';
import { extractRecipe, NoRecipeFoundError, type ImportedRecipe } from '@/src/core/recipeImport';
import { AiSortError, checkGemini, MAX_TEXT_LENGTH, sortWithGemini } from './aiSort';
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
  // The app's own public key, which the app sends with every call. The
  // function's SUPABASE_ANON_KEY is the old-style key, which Supabase rejects
  // once a project has switched to the new publishable keys.
  const apiKey = req.headers.get('apikey') || env('SUPABASE_ANON_KEY');
  if (!auth || !supabaseUrl || !apiKey) return false;
  try {
    const res = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers: { authorization: auth, apikey: apiKey } });
    if (!res.ok) {
      console.warn('Sign-in check failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return false;
    }
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

/**
 * The page's recipe sorted by AI, or null when AI isn't available (signed out,
 * no key, allowance used up, failed), so the page's own recipe data is used.
 */
async function sortPageWithAi(
  req: Request,
  html: string,
  url: string,
  found: ImportedRecipe | null,
): Promise<{ recipe: ImportedRecipe } | { reason: string }> {
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) return { reason: 'the Gemini key isn’t set up on the import helper.' };
  if (!(await isSignedIn(req))) return { reason: 'the import helper couldn’t confirm you’re signed in.' };
  const text = found ? recipeAsText(found) : pageText(html);
  if (text.trim().length < 40) return { reason: 'the page had too little text.' };
  try {
    return { recipe: withPageDetails(await sortWithGemini(text, url, { apiKey, model: env('GEMINI_MODEL') }), found, url) };
  } catch (e) {
    if (!(e instanceof AiSortError) || e.code === 'failed') console.error('AI sort of page failed', url, e);
    return { reason: e instanceof AiSortError ? e.message : 'AI sorting failed.' };
  }
}

export async function handleImport(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Use POST.', code: 'bad-url' }, 405);
  if (req.method === 'GET' && new URL(req.url).searchParams.get('check') === 'gemini') {
    const asked = new URL(req.url).searchParams.get('model');
    const model = asked && /^gemini-[\w.-]{1,60}$/.test(asked) ? asked : env('GEMINI_MODEL');
    return json(await checkGemini({ apiKey: env('GEMINI_API_KEY'), model }));
  }
  const body: RequestBody = req.method === 'POST' ? ((await req.json().catch(() => null)) as RequestBody) : null;
  if (typeof body?.text === 'string') return sortText(req, { text: body.text, sourceUrl: body.sourceUrl });
  const target = req.method === 'GET' ? new URL(req.url).searchParams.get('url') : typeof body?.url === 'string' ? body.url : null;
  if (!target) return json({ error: 'Give a recipe address.', code: 'bad-url' }, 400);
  try {
    const page = await fetchPage(target);
    let found: ImportedRecipe | null = null;
    try {
      found = extractRecipe(page.html, page.url);
    } catch (e) {
      if (!(e instanceof NoRecipeFoundError)) throw e;
    }
    const ai = await sortPageWithAi(req, page.html, page.url, found);
    if ('recipe' in ai) return json({ recipe: ai.recipe });
    if (!found) throw new NoRecipeFoundError();
    return json({ recipe: { ...found, aiNote: ai.reason } });
  } catch (e) {
    if (e instanceof NoRecipeFoundError) return json({ error: NO_RECIPE_MESSAGE, code: 'no-recipe' }, 422);
    if (e instanceof ImportError) return json({ error: e.message, code: e.code }, e.code === 'bad-url' ? 400 : 502);
    console.error('import-recipe failed', target, e);
    return json({ error: 'Something went wrong reading that page.', code: 'unreachable' }, 500);
  }
}
