import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiSortError, geminiRequest, recipeFromAnswer, sortWithGemini } from '@/src/import/aiSort';
import { pageText, recipeAsText, withPageDetails } from '@/src/core/recipeForAi';
import { extractRecipe } from '@/src/core/recipeImport';
import { handleImport } from '@/src/import/importHandler';
import wprmBlog from './pages/wprm-blog.html?raw';
import { sortRecipeText } from '@/src/import/sortText';

vi.mock('@/src/backend/supabase', () => ({ supabase: null }));

const answer = {
  title: 'Crispy chilli beef',
  description: 'Sticky, crunchy and ready in 30 minutes.',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  ingredientGroups: [
    { heading: 'Beef', items: ['300g beef rump, sliced', '- 2 tbsp cornflour'] },
    { heading: 'Sauce:', items: ['3 tbsp sweet chilli sauce', '1 tbsp soy sauce'] },
    { heading: '', items: [] },
  ],
  methodGroups: [
    { heading: '', steps: ['1. Toss the beef in cornflour.', 'Step 2: Fry until crisp.'] },
    { heading: 'Sauce', steps: ['Mix the sauce and toss through.'] },
  ],
  notes: ['Keeps 3 days in the fridge.'],
};

const geminiReply = (json: unknown, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP' }] }), { status });

describe('recipeFromAnswer', () => {
  it('turns the AI answer into a recipe for the editor', () => {
    const r = recipeFromAnswer(JSON.stringify(answer), 'https://www.instagram.com/p/abc/');
    expect(r.title).toBe('Crispy chilli beef');
    expect(r.servings).toBe(2);
    expect(r.prepMinutes).toBe(10);
    expect(r.cookMinutes).toBe(20);
    expect(r.ingredients).toEqual([
      { heading: 'Beef', items: ['300g beef rump, sliced', '2 tbsp cornflour'] },
      { heading: 'Sauce', items: ['3 tbsp sweet chilli sauce', '1 tbsp soy sauce'] },
    ]);
    expect(r.instructions).toEqual([
      { heading: undefined, steps: ['Toss the beef in cornflour.', 'Fry until crisp.'] },
      { heading: 'Sauce', steps: ['Mix the sauce and toss through.'] },
    ]);
    expect(r.notes).toBe('Keeps 3 days in the fridge.');
    expect(r.sourceUrl).toBe('https://www.instagram.com/p/abc/');
    expect(r.foundBy).toBe('ai');
  });

  it('leaves out missing numbers and names an untitled recipe', () => {
    const r = recipeFromAnswer(JSON.stringify({ ...answer, title: '', servings: null, prepMinutes: null, cookMinutes: 0 }));
    expect(r.title).toBe('Pasted recipe');
    expect(r.servings).toBeUndefined();
    expect(r.prepMinutes).toBeUndefined();
    expect(r.cookMinutes).toBeUndefined();
  });

  it('says when there are no ingredients, or the answer is not JSON', () => {
    expect(() => recipeFromAnswer(JSON.stringify({ ...answer, ingredientGroups: [] }))).toThrow(
      expect.objectContaining({ code: 'no-recipe' }),
    );
    expect(() => recipeFromAnswer('not json')).toThrow(expect.objectContaining({ code: 'failed' }));
  });
});

describe('sortWithGemini', () => {
  it('asks Gemini for JSON in the recipe shape, with the key in a header', async () => {
    const fetchImpl = vi.fn(async () => geminiReply(answer));
    const r = await sortWithGemini('the caption', '', { apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.title).toBe('Crispy chilli beef');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts[0].text).toContain('the caption');
    expect(geminiRequest('x').generationConfig.responseSchema.required).toContain('ingredientGroups');
  });

  it('reports a missing key and a used-up allowance', async () => {
    await expect(sortWithGemini('x', '', {})).rejects.toMatchObject({ code: 'not-configured' });
    const busy = vi.fn(async () => new Response('{}', { status: 429 })) as unknown as typeof fetch;
    await expect(sortWithGemini('x', '', { apiKey: 'k', fetchImpl: busy })).rejects.toBeInstanceOf(AiSortError);
    await expect(sortWithGemini('x', '', { apiKey: 'k', fetchImpl: busy })).rejects.toMatchObject({ code: 'busy' });
  });
});

describe('import helper: sorting text', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const env: Record<string, string> = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    GEMINI_API_KEY: 'gemini-key',
  };
  /** Like the app's calls, which always carry the project's publishable key. */
  const post = (body: unknown, auth?: string, apikey = 'sb_publishable_app') =>
    new Request('https://project.supabase.co/functions/v1/import-recipe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey, ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    });

  /**
   * Supabase says only "Bearer user-token" is a signed-in person, and (as in a
   * project on the new keys) only accepts the publishable key, not the old anon key.
   */
  const stubBackend = () => {
    vi.stubGlobal('Deno', { env: { get: (n: string) => env[n] } });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://blog.test/')) {
        return new Response(url.endsWith('/no-data') ? NO_DATA_PAGE : wprmBlog, { headers: { 'content-type': 'text/html' } });
      }
      if (url.endsWith('/auth/v1/user')) {
        const headers = new Headers(init?.headers);
        if (headers.get('apikey') !== 'sb_publishable_app') return new Response('{"message":"Invalid API key"}', { status: 401 });
        const auth = headers.get('authorization');
        return auth === 'Bearer user-token' ? new Response(JSON.stringify({ id: 'u1' })) : new Response('{}', { status: 401 });
      }
      return geminiReply(answer);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('sorts text for someone signed in', async () => {
    stubBackend();
    const res = await handleImport(post({ text: 'caption', sourceUrl: 'https://x.test/' }, 'Bearer user-token'));
    expect(res.status).toBe(200);
    const { recipe } = await res.json();
    expect(recipe.title).toBe('Crispy chilli beef');
    expect(recipe.sourceUrl).toBe('https://x.test/');
  });

  it('checks sign-in with the key the app sent, not the old anon key', async () => {
    stubBackend();
    expect((await handleImport(post({ text: 'caption' }, 'Bearer user-token'))).status).toBe(200);
    // Without the app's key, the old anon key is tried, and refused.
    expect((await handleImport(post({ text: 'caption' }, 'Bearer user-token', ''))).status).toBe(401);
  });

  it('says why a website import was not sorted by AI', async () => {
    stubBackend();
    const { recipe } = await (await handleImport(post({ url: 'https://blog.test/recipe' }))).json();
    expect(recipe.aiNote).toMatch(/signed in/);
  });

  it('turns away requests with only the public app key, without asking Gemini', async () => {
    const fetchMock = stubBackend();
    const res = await handleImport(post({ text: 'caption' }, 'Bearer anon'));
    expect(res.status).toBe(401);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('googleapis'))).toBe(false);
    expect((await handleImport(post({ text: 'caption' }))).status).toBe(401);
  });

  it('tidies a website recipe with AI for someone signed in, keeping the page photo', async () => {
    const fetchMock = stubBackend();
    const res = await handleImport(post({ url: 'https://blog.test/recipe' }, 'Bearer user-token'));
    expect(res.status).toBe(200);
    const { recipe } = await res.json();
    expect(recipe.foundBy).toBe('ai');
    expect(recipe.title).toBe('Crispy chilli beef');
    const page = extractRecipe(wprmBlog, 'https://blog.test/recipe');
    expect(recipe.imageUrl).toBe(page.imageUrl);
    // Gemini was given the page's recipe written out, not the whole page.
    const geminiCall = fetchMock.mock.calls.find(([u]) => String(u).includes('googleapis'))!;
    expect(JSON.parse(String(geminiCall[1]!.body)).contents[0].parts[0].text).toContain(page.ingredients[0].items[0]);
  });

  it('finds a recipe in the page words with AI when the page has no recipe data', async () => {
    stubBackend();
    const res = await handleImport(post({ url: 'https://blog.test/no-data' }, 'Bearer user-token'));
    expect(res.status).toBe(200);
    expect((await res.json()).recipe.foundBy).toBe('ai');
  });

  it('uses the page recipe data as before when signed out', async () => {
    const fetchMock = stubBackend();
    const res = await handleImport(post({ url: 'https://blog.test/recipe' }));
    expect(res.status).toBe(200);
    expect((await res.json()).recipe.foundBy).not.toBe('ai');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('googleapis'))).toBe(false);
    expect((await handleImport(post({ url: 'https://blog.test/no-data' }))).status).toBe(422);
  });

  it('says when the Gemini key is not set yet', async () => {
    stubBackend();
    delete env.GEMINI_API_KEY;
    const res = await handleImport(post({ text: 'caption' }, 'Bearer user-token'));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('not-configured');
    env.GEMINI_API_KEY = 'gemini-key';
  });
});

const NO_DATA_PAGE = `<html><head><title>Nan's scones | Blog</title></head><body><nav>Home Recipes About</nav>
<main><h1>Nan's scones</h1><p>My nan made these every Sunday.</p><p>You need 3 cups self-raising flour, 1 cup cream and 1 cup lemonade.</p>
<p>Mix, cut out and bake at 220C for 12 minutes.</p></main><footer>Copyright</footer><script>var x = 1;</script></body></html>`;

describe('website recipes for AI', () => {
  it('writes a found recipe out as text with its sections', () => {
    const page = extractRecipe(wprmBlog, 'https://blog.test/recipe');
    const text = recipeAsText(page);
    expect(text.startsWith(page.title)).toBe(true);
    expect(text).toContain('Ingredients');
    expect(text).toContain(`- ${page.ingredients[0].items[0]}`);
    expect(text).toContain(`1. ${page.instructions[0].steps[0]}`);
  });

  it('reads the words of a page with no recipe data, without menus or scripts', () => {
    const text = pageText(NO_DATA_PAGE);
    expect(text).toContain('3 cups self-raising flour');
    expect(text).not.toContain('Home Recipes About');
    expect(text).not.toContain('var x');
    expect(text).not.toContain('Copyright');
  });

  it('cuts a long page to the part around the ingredients', () => {
    const story = '<p>' + 'A long story about summer. '.repeat(2000) + '</p>';
    const text = pageText(`<body><h1>Scones</h1>${story}<h2>Ingredients</h2><ul><li>3 cups flour</li></ul></body>`);
    expect(text.length).toBeLessThanOrEqual(20_000);
    expect(text).toContain('3 cups flour');
    expect(text.startsWith('Scones')).toBe(true);
  });

  it('keeps the page photo, address and numbers with the AI recipe', () => {
    const ai = recipeFromAnswer(JSON.stringify({ ...answer, servings: null, title: '' }));
    const page = extractRecipe(wprmBlog, 'https://blog.test/recipe');
    const r = withPageDetails(ai, page, 'https://blog.test/recipe');
    expect(r.title).toBe(page.title);
    expect(r.imageUrl).toBe(page.imageUrl);
    expect(r.servings).toBe(page.servings);
    expect(r.ingredients).toEqual(ai.ingredients);
    expect(r.sourceUrl).toBe('https://blog.test/recipe');
    expect(withPageDetails(ai, null, 'https://x.test/').sourceUrl).toBe('https://x.test/');
  });
});

describe('sortRecipeText', () => {
  const text = 'Toast\n\nIngredients\n2 slices bread\n1 tbsp butter\n\nMethod\n1. Toast the bread.\n2. Butter it.';

  it('uses the AI recipe when there is one', async () => {
    const ai = vi.fn(async () => ({ recipe: recipeFromAnswer(JSON.stringify(answer)) }));
    const { recipe, sortedBy } = await sortRecipeText(text, 'https://x.test/', ai);
    expect(sortedBy).toBe('ai');
    expect(recipe.title).toBe('Crispy chilli beef');
    expect(recipe.sourceUrl).toBe('https://x.test/');
  });

  it('falls back to the rules when the AI is unavailable (offline, signed out, demo mode)', async () => {
    const { recipe, sortedBy } = await sortRecipeText(text, '', async () => ({ reason: 'you’re signed out.' }));
    expect(sortedBy).toBe('rules');
    expect(recipe.aiNote).toBe('you’re signed out.');
    expect(recipe.ingredients[0].items).toEqual(['2 slices bread', '1 tbsp butter']);
    // Demo mode (no Supabase) goes straight to the rules.
    expect((await sortRecipeText(text)).sortedBy).toBe('rules');
  });
});
