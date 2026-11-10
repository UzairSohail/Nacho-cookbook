import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiSortError, geminiRequest, recipeFromAnswer, sortWithGemini } from '@/src/import/aiSort';
import { handleImport } from '@/src/import/importHandler';
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
  const post = (body: unknown, auth?: string) =>
    new Request('https://project.supabase.co/functions/v1/import-recipe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    });

  /** Supabase says only "Bearer user-token" is a signed-in person. */
  const stubBackend = () => {
    vi.stubGlobal('Deno', { env: { get: (n: string) => env[n] } });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/v1/user')) {
        const auth = new Headers(init?.headers).get('authorization');
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

  it('turns away requests with only the public app key, without asking Gemini', async () => {
    const fetchMock = stubBackend();
    const res = await handleImport(post({ text: 'caption' }, 'Bearer anon'));
    expect(res.status).toBe(401);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('googleapis'))).toBe(false);
    expect((await handleImport(post({ text: 'caption' }))).status).toBe(401);
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

describe('sortRecipeText', () => {
  const text = 'Toast\n\nIngredients\n2 slices bread\n1 tbsp butter\n\nMethod\n1. Toast the bread.\n2. Butter it.';

  it('uses the AI recipe when there is one', async () => {
    const ai = vi.fn(async () => recipeFromAnswer(JSON.stringify(answer)));
    const { recipe, sortedBy } = await sortRecipeText(text, 'https://x.test/', ai);
    expect(sortedBy).toBe('ai');
    expect(recipe.title).toBe('Crispy chilli beef');
    expect(recipe.sourceUrl).toBe('https://x.test/');
  });

  it('falls back to the rules when the AI is unavailable (offline, signed out, demo mode)', async () => {
    const { recipe, sortedBy } = await sortRecipeText(text, '', async () => null);
    expect(sortedBy).toBe('rules');
    expect(recipe.ingredients[0].items).toEqual(['2 slices bread', '1 tbsp butter']);
    // Demo mode (no Supabase) goes straight to the rules.
    expect((await sortRecipeText(text)).sortedBy).toBe('rules');
  });
});
