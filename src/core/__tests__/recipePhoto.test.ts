import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleImport } from '@/src/import/importHandler';
import {
  findRecipePhoto,
  pickByWords,
  pickFromAnswer,
  plainDishName,
  queriesFromAnswer,
  searchableTitle,
  searchPexels,
  searchWikimedia,
  type PhotoCandidate,
} from '@/src/import/recipePhoto';

vi.mock('@/src/backend/supabase', () => ({ supabase: null }));

const geminiReply = (json: unknown, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP' }] }), { status });

const pexelsBody = {
  photos: [
    {
      alt: 'Raw chicken breasts on a chopping board',
      url: 'https://www.pexels.com/photo/raw-chicken-111/',
      photographer: 'Ann Lee',
      src: { large: 'https://images.pexels.com/photos/111/raw.jpeg?h=650&w=940' },
    },
    {
      alt: 'Creamy chicken pasta with sun dried tomatoes and spinach in a pan',
      url: 'https://www.pexels.com/photo/creamy-pasta-222/',
      photographer: 'Bo Chen',
      src: { large: 'https://images.pexels.com/photos/222/pasta.jpeg?h=650&w=940' },
    },
    { alt: '', url: 'https://www.pexels.com/photo/tuscan-chicken-skillet-333/', photographer: 'Cy', src: { large: 'https://images.pexels.com/photos/333/a.jpeg' } },
    { alt: 'Not a Pexels image', url: 'x', photographer: 'Evil', src: { large: 'https://evil.test/a.jpeg' } },
  ],
};

const commonsBody = {
  query: {
    pages: [
      {
        index: 2,
        title: 'File:Tuscan chicken.jpg',
        imageinfo: [
          {
            thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tuscan_chicken.jpg/1200px-Tuscan_chicken.jpg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Tuscan_chicken.jpg',
            mime: 'image/jpeg',
            width: 3000,
            height: 2000,
            extmetadata: {
              ImageDescription: { value: '<p>Chicken in a <b>creamy</b> sauce</p>' },
              Artist: { value: '<a href="x">Dee</a>' },
              LicenseShortName: { value: 'CC BY-SA 4.0' },
            },
          },
        ],
      },
      { index: 1, title: 'File:Map of Tuscany.svg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/m.png', mime: 'image/svg+xml', width: 2000, height: 2000 }] },
      { index: 3, title: 'File:Tiny.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/t.jpg', mime: 'image/jpeg', width: 200, height: 150 }] },
    ],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('dish names', () => {
  it('cleans a blog-style title into a search phrase', () => {
    expect(plainDishName('The BEST One-Pan Creamy Tuscan Chicken (30 minutes!) 🍗')).toBe('creamy tuscan chicken');
    expect(plainDishName('Easy Beef Lasagna | My Food Blog')).toBe('beef lasagna');
  });

  it('skips names that say nothing about the dish', () => {
    expect(searchableTitle('Pasted recipe')).toBe(false);
    expect(searchableTitle('  ')).toBe(false);
    expect(searchableTitle('Easy recipe')).toBe(false);
    expect(searchableTitle('Chicken katsu curry')).toBe(true);
  });
});

describe('reading Gemini answers', () => {
  it('reads search phrases, tidied and without repeats', () => {
    expect(queriesFromAnswer(JSON.stringify({ queries: ['"Katsu Curry"', 'katsu curry', 'chicken curry rice', 'x', 'four'] }))).toEqual([
      'katsu curry',
      'chicken curry rice',
      'four',
    ]);
    expect(() => queriesFromAnswer('nope')).toThrow();
  });

  it('reads the picked photo, 0 meaning none', () => {
    expect(pickFromAnswer('{"choice":2}', 3)).toBe(1);
    expect(pickFromAnswer('{"choice":"1"}', 3)).toBe(0);
    expect(pickFromAnswer('{"choice":0}', 3)).toBe(-1);
    expect(() => pickFromAnswer('{"choice":4}', 3)).toThrow();
  });
});

describe('photo libraries', () => {
  it('reads Pexels results, keeping only Pexels images', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(pexelsBody)));
    const found = await searchPexels('creamy tuscan chicken', 'key', fetchImpl as unknown as typeof fetch);
    expect(found.map((f) => f.url)).toEqual([
      'https://images.pexels.com/photos/111/raw.jpeg?h=650&w=940',
      'https://images.pexels.com/photos/222/pasta.jpeg?h=650&w=940',
      'https://images.pexels.com/photos/333/a.jpeg',
    ]);
    expect(found[1].credit).toBe('Bo Chen on Pexels');
    // No alt text: the page address says what it shows.
    expect(found[2].description).toBe('tuscan chicken skillet');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('query=creamy%20tuscan%20chicken');
    expect(new Headers(init.headers).get('authorization')).toBe('key');
  });

  it('reads Wikimedia Commons results: photos only, big enough, in search order', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(commonsBody)));
    const found = await searchWikimedia('tuscan chicken', fetchImpl as unknown as typeof fetch);
    expect(found).toHaveLength(1);
    expect(found[0].description).toBe('Tuscan chicken: Chicken in a creamy sauce');
    expect(found[0].credit).toBe('Dee (CC BY-SA 4.0), Wikimedia Commons');
    expect(found[0].url).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
  });
});

describe('Wikimedia answers in parts', () => {
  it('asks again for image details Commons held back', async () => {
    const info = (n: number) => ({
      thumburl: `https://upload.wikimedia.org/${n}.jpg`,
      mime: 'image/jpeg',
      width: 1600,
      height: 1200,
    });
    const first = {
      continue: { iicontinue: 'B.jpg|2026', continue: 'gsroffset||' },
      query: { pages: [{ index: 1, title: 'File:A lasagna.jpg', imageinfo: [info(1)] }, { index: 2, title: 'File:B lasagna.jpg' }] },
    };
    const second = {
      continue: { gsroffset: '8', continue: 'gsroffset||' },
      query: { pages: [{ index: 1, title: 'File:A lasagna.jpg' }, { index: 2, title: 'File:B lasagna.jpg', imageinfo: [info(2)] }] },
    };
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('iicontinue=') ? second : first)));
    const found = await searchWikimedia('lasagna', fetchImpl as unknown as typeof fetch);
    expect(found.map((f) => f.url)).toEqual(['https://upload.wikimedia.org/1.jpg', 'https://upload.wikimedia.org/2.jpg']);
    // Stops before the next page of search results.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('pickByWords', () => {
  const c = (description: string): PhotoCandidate => ({ url: description, description, credit: '', source: 'pexels', pageUrl: '' });
  it('takes the first photo described with most of the words', () => {
    expect(pickByWords('beef lasagna', [c('a bowl of soup'), c('Lasagna with beef ragu'), c('beef lasagne')])).toBe(1);
    expect(pickByWords('beef lasagna', [c('a bowl of soup')])).toBe(-1);
  });
});

describe('findRecipePhoto', () => {
  /** Gemini answers the search phrase question, then the pick. */
  const libraries = (gemini: (body: string) => Response) =>
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://api.pexels.com/')) return new Response(JSON.stringify(pexelsBody));
      if (url.startsWith('https://commons.wikimedia.org/')) return new Response(JSON.stringify(commonsBody));
      return gemini(String(init?.body ?? ''));
    });

  it('has Gemini choose the search phrase and the photo', async () => {
    const fetchImpl = libraries((body) =>
      body.includes('Photos:') ? geminiReply({ choice: 2 }) : geminiReply({ queries: ['creamy tuscan chicken', 'chicken in cream sauce'] }),
    );
    const result = await findRecipePhoto('The BEST Tuscan Chicken!!', ['chicken thighs', 'cream'], {
      apiKey: 'g',
      pexelsApiKey: 'p',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryPauseMs: 0,
    });
    expect(result.pickedBy).toBe('ai');
    expect(result.photo?.url).toBe('https://images.pexels.com/photos/222/pasta.jpeg?h=650&w=940');
    // 4+ candidates from the first phrase, so the second wasn't needed.
    const searches = fetchImpl.mock.calls.filter(([u]) => /pexels|wikimedia/.test(String(u)));
    expect(searches).toHaveLength(2);
    const pickBody = String((fetchImpl.mock.calls.at(-1)![1] as RequestInit).body);
    expect(pickBody).toContain('Recipe: The BEST Tuscan Chicken!!');
    expect(pickBody).toContain('2. Creamy chicken pasta');
  });

  it('adds no photo when Gemini says none fit', async () => {
    const fetchImpl = libraries((body) => (body.includes('Photos:') ? geminiReply({ choice: 0 }) : geminiReply({ queries: ['tuscan chicken'] })));
    const result = await findRecipePhoto('Tuscan chicken', [], { apiKey: 'g', pexelsApiKey: 'p', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.photo).toBeNull();
  });

  it('works from the name alone without Gemini or a Pexels key', async () => {
    const fetchImpl = libraries(() => new Response('unexpected', { status: 500 }));
    const result = await findRecipePhoto('Easy Tuscan Chicken', [], { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.pickedBy).toBe('words');
    expect(result.photo?.source).toBe('wikimedia');
    expect(fetchImpl.mock.calls.every(([u]) => String(u).startsWith('https://commons.wikimedia.org/'))).toBe(true);
  });

  it('falls back to matching words when Gemini is down', async () => {
    const fetchImpl = libraries(() => new Response('{"error":{"message":"overloaded"}}', { status: 503 }));
    const result = await findRecipePhoto('Creamy chicken pasta', [], {
      apiKey: 'g',
      pexelsApiKey: 'p',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryPauseMs: 0,
    });
    expect(result.pickedBy).toBe('words');
    expect(result.photo?.url).toBe('https://images.pexels.com/photos/222/pasta.jpeg?h=650&w=940');
  });
});

describe('the import helper', () => {
  const post = (body: unknown, auth?: string) =>
    new Request('https://project.supabase.co/functions/v1/import-recipe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: 'sb_publishable_app', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    });
  const env: Record<string, string> = { SUPABASE_URL: 'https://project.supabase.co', GEMINI_API_KEY: 'g', PEXELS_API_KEY: 'p' };

  const stub = () => {
    vi.stubGlobal('Deno', { env: { get: (n: string) => env[n] } });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/v1/user')) {
        const auth = new Headers(init?.headers).get('authorization');
        return auth === 'Bearer user-token' ? new Response(JSON.stringify({ id: 'u1' })) : new Response('{}', { status: 401 });
      }
      if (url.startsWith('https://api.pexels.com/')) return new Response(JSON.stringify(pexelsBody));
      if (url.startsWith('https://commons.wikimedia.org/')) return new Response(JSON.stringify(commonsBody));
      return String(init?.body).includes('Photos:') ? geminiReply({ choice: 3 }) : geminiReply({ queries: ['tuscan chicken'] });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('finds a photo for someone signed in', async () => {
    stub();
    const res = await handleImport(post({ photoFor: { title: 'Tuscan chicken', ingredients: ['chicken'] } }, 'Bearer user-token'));
    expect(res.status).toBe(200);
    const { photo, pickedBy } = await res.json();
    expect(pickedBy).toBe('ai');
    expect(photo.url).toBe('https://images.pexels.com/photos/333/a.jpeg');
    expect(photo.credit).toBe('Cy on Pexels');
  });

  it('refuses strangers and nameless recipes', async () => {
    const fetchMock = stub();
    expect((await handleImport(post({ photoFor: { title: 'Tuscan chicken' } }))).status).toBe(401);
    expect((await handleImport(post({ photoFor: { title: 'Pasted recipe' } }, 'Bearer user-token'))).status).toBe(400);
    expect(fetchMock.mock.calls.some(([u]) => /pexels|wikimedia|generativelanguage/.test(String(u)))).toBe(false);
  });

  it('reports whether the photo libraries answer', async () => {
    stub();
    const res = await handleImport(new Request('https://project.supabase.co/functions/v1/import-recipe?check=photos'));
    expect(await res.json()).toMatchObject({ pexelsKeySet: true, pexels: 3, wikimedia: 1, problems: [] });
  });
});
