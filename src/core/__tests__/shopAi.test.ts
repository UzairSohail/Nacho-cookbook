import { afterEach, describe, expect, it, vi } from 'vitest';

import { costLine, loadPriceData, needFor, totalsFor, type PriceFile, type Product } from '@/src/core/prices';
import {
  lineSignature,
  planFromAnswer,
  shopGeminiRequest,
  shopPrompt,
  shopRequestProblem,
  shortlist,
  type ShopAiRequest,
} from '@/src/core/shopAi';
import { handleImport } from '@/src/import/importHandler';

const file: PriceFile = {
  version: 1,
  source: 'hotprices.org',
  updated: '2026-11-11',
  stores: {
    woolies: [
      ['w1', 'Woolworths Garlic Bulb', 0.9, 1, 'ea', 1],
      ['w2', 'Woolworths Garlic 500g Net', 9.5, 500, 'g', 1],
      ['w3', 'Woolworths Minced Garlic', 1.25, 250, 'g', 0],
      ['w4', 'Garlic Naan', 3.9, 2, 'ea', 0],
      ['w5', 'Lemons Loose', 0.8, 1, 'ea', 1],
    ],
    coles: [
      ['c1', 'Coles Garlic Loose', 1.1, 1, 'ea', 1],
      ['c2', 'Coles Garlic Prepacked 250g', 5, 250, 'g', 1],
      ['c3', 'Coles Lemons Loose', 0.9, 1, 'ea', 1],
    ],
  },
};
const data = loadPriceData(file);
const product = (store: 'woolies' | 'coles', id: string) => data.stores[store].byId.get(id)!;

const request: ShopAiRequest = {
  lines: [
    {
      id: 'a',
      name: 'garlic',
      amount: '1',
      recipes: ['Pasta'],
      candidates: { woolies: [product('woolies', 'w1'), product('woolies', 'w2')], coles: [product('coles', 'c1')] },
    },
    {
      id: 'b',
      name: 'garlic cloves',
      amount: '3 clove',
      recipes: ['Curry'],
      candidates: { woolies: [product('woolies', 'w1')], coles: [product('coles', 'c1'), product('coles', 'c2')] },
    },
    { id: 'c', name: 'lemon juice', amount: '2 tbsp', recipes: [], candidates: { woolies: [product('woolies', 'w5')], coles: [] } },
  ],
};

describe('shortlist', () => {
  it('offers close matches and good value, without unrelated products', () => {
    const list = shortlist('garlic', data.stores.woolies, { produce: true });
    expect(list.map((p) => p.id)).toContain('w1');
    expect(list.length).toBeLessThanOrEqual(8);
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
  });
});

describe('the prompt', () => {
  it('lists each line with lettered products per store', () => {
    const text = shopPrompt(request);
    expect(text).toContain('L1: garlic, need 1 (for Pasta)');
    expect(text).toContain('W1 Woolworths Garlic Bulb, each, $0.90');
    expect(text).toContain('L3: lemon juice, need 2 tbsp');
    expect(text).toMatch(/L3[\s\S]*Coles: nothing found/);
  });

  it('asks for JSON with thinking off, and can leave thinking out', () => {
    const body = shopGeminiRequest(request);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig).toHaveProperty('thinkingConfig');
    expect(shopGeminiRequest(request, { thinking: false }).generationConfig).not.toHaveProperty('thinkingConfig');
  });

  it('refuses malformed or oversized requests', () => {
    expect(shopRequestProblem(request)).toBeNull();
    expect(shopRequestProblem({ lines: [] })).toMatch(/empty/);
    expect(shopRequestProblem({ lines: Array.from({ length: 81 }, () => request.lines[0]) })).toMatch(/too long/);
    expect(shopRequestProblem({ lines: [{ id: 'x' }] })).toMatch(/malformed/);
  });
});

describe('reading the answer', () => {
  const answer = JSON.stringify({
    lines: [
      { line: 'L1', sameAs: '', buy: '1 garlic bulb', woolies: 'W1', wooliesPacks: 1, coles: 'C1', colesPacks: 1 },
      { line: 'L2', sameAs: 'L1', buy: 'with the garlic above', woolies: 'W1', wooliesPacks: 1, coles: '', colesPacks: 0 },
      { line: 'L3', sameAs: '', buy: '1 lemon', woolies: 'W1', wooliesPacks: 1, coles: 'C4', colesPacks: 1 },
      { line: 'L9', sameAs: '', buy: 'nothing', woolies: 'W1', wooliesPacks: 1, coles: '', colesPacks: 0 },
    ],
  });

  it('maps refs back to real products and merges same-thing lines', () => {
    const plan = planFromAnswer(answer, request);
    expect(plan.a).toEqual({ buy: '1 garlic bulb', woolies: { productId: 'w1', packs: 1 }, coles: { productId: 'c1', packs: 1 } });
    expect(plan.b).toEqual({ buy: 'with the garlic above', coveredBy: 'a' });
    // C4 wasn't offered for that line, so it's dropped; L9 doesn't exist.
    expect(plan.c).toEqual({ buy: '1 lemon', woolies: { productId: 'w5', packs: 1 } });
    expect(Object.keys(plan)).toEqual(['a', 'b', 'c']);
  });

  it('ignores "same as" chains and loops', () => {
    const loop = JSON.stringify({
      lines: [
        { line: 'L1', sameAs: 'L2', buy: '', woolies: 'W1', wooliesPacks: 1, coles: '', colesPacks: 1 },
        { line: 'L2', sameAs: 'L1', buy: '', woolies: 'W1', wooliesPacks: 1, coles: '', colesPacks: 1 },
      ],
    });
    const plan = planFromAnswer(loop, request);
    expect(plan.a.coveredBy).toBeUndefined();
    expect(plan.b.coveredBy).toBeUndefined();
  });

  it('reads loosely shaped answers: refs with names, bare numbers, a bare array, or by position', () => {
    const loose = JSON.stringify([
      { line: 'L1: garlic', sameAs: '', buy: '1 bulb', woolies: 'W1 Woolworths Garlic Bulb', wooliesPacks: '1', coles: '1', colesPacks: 1 },
      { line: 'garlic cloves', sameAs: 'L1', buy: '', woolies: '', wooliesPacks: 0, coles: '', colesPacks: 0 },
      { line: '', sameAs: '', buy: '1 bottle', woolies: 'Lemons Loose', wooliesPacks: 2, coles: '', colesPacks: 0 },
    ]);
    const plan = planFromAnswer(loose, request);
    expect(plan.a).toMatchObject({ woolies: { productId: 'w1', packs: 1 }, coles: { productId: 'c1' } });
    expect(plan.b.coveredBy).toBe('a');
    expect(plan.c.woolies).toEqual({ productId: 'w5', packs: 2 });
    expect(Object.keys(planFromAnswer(JSON.stringify({ items: [{ line: '1', woolies: 'W2' }] }), request))).toEqual(['a']);
  });

  it('throws on unreadable answers', () => {
    expect(() => planFromAnswer('nope', request)).toThrow();
    expect(() => planFromAnswer('{"lines":[]}', request)).toThrow(/no list lines: \{"lines":\[\]\}/);
  });
});

describe('costing with AI picks', () => {
  const need = needFor(4, 'clove');

  it('uses Gemini’s product and pack count when nobody has picked', () => {
    const line = costLine('garlic cloves', need, data, null, { ai: { buy: '1 garlic bulb', woolies: { productId: 'w1', packs: 1 } } });
    expect(line.woolies).toMatchObject({ product: { id: 'w1' }, packs: 1, ai: true, picked: false });
    expect(line.aiBuy).toBe('1 garlic bulb');
    // Coles had no AI pick, so the built-in suggestion stands.
    expect(line.coles?.ai).toBeFalsy();
  });

  it('lets people’s own picks beat Gemini', () => {
    const mine: Product = product('woolies', 'w2');
    const line = costLine('garlic', need, data, { woolies: mine, store: 'woolies' }, {
      ai: { buy: '1 bulb', woolies: { productId: 'w1', packs: 1 }, coveredBy: 'other' },
    });
    expect(line.coveredBy).toBeUndefined();
    expect(line.woolies).toMatchObject({ product: { id: 'w2' }, picked: true });
    expect(line.chosen).toBe('woolies');
  });

  it('never buys fewer packs than the amount needs', () => {
    const line = costLine('lemon', needFor(3, null), data, null, { ai: { buy: '1 lemon', woolies: { productId: 'w5', packs: 1 } } });
    expect(line.woolies?.packs).toBe(3);
  });

  it('leaves lines bought with another out of the totals', () => {
    const covered = costLine('garlic cloves', need, data, null, { ai: { buy: '', coveredBy: 'a' } });
    expect(covered).toMatchObject({ woolies: null, coles: null, chosen: null, coveredBy: 'a' });
    const bought = costLine('garlic', need, data, null, { ai: { buy: '1 bulb', woolies: { productId: 'w1', packs: 1 }, coles: { productId: 'c1', packs: 1 } } });
    const t = totalsFor([bought, covered]);
    expect(t.priced).toBe(1);
    expect(t.unpriced).toBe(0);
    expect(t.woolies).toBeCloseTo(0.9);
  });

  it('falls back to the rules when the AI product is gone from today’s prices', () => {
    const line = costLine('garlic', need, data, null, { ai: { buy: '', woolies: { productId: 'gone', packs: 1 } } });
    expect(line.woolies?.ai).toBeFalsy();
    expect(line.woolies).not.toBeNull();
  });
});

describe('line signatures', () => {
  it('change when the amount or name changes', () => {
    const base = { name: 'Garlic', quantity: 4, unit: 'clove' };
    expect(lineSignature(base)).toBe(lineSignature({ ...base, name: ' garlic ' }));
    expect(lineSignature(base)).not.toBe(lineSignature({ ...base, quantity: 5 }));
  });
});

describe('the import helper’s shop route', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env: Record<string, string> = { SUPABASE_URL: 'https://project.supabase.co', GEMINI_API_KEY: 'k' };
  const post = (body: unknown, auth?: string) =>
    new Request('https://project.supabase.co/functions/v1/import-recipe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: 'sb_publishable_app', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    });
  const stub = (answer: unknown) => {
    vi.stubGlobal('Deno', { env: { get: (n: string) => env[n] } });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/v1/user')) {
        const auth = new Headers(init?.headers).get('authorization');
        return auth === 'Bearer user-token' ? new Response(JSON.stringify({ id: 'u1' })) : new Response('{}', { status: 401 });
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('returns Gemini’s plan for someone signed in', async () => {
    stub({ lines: [{ line: 'L1', sameAs: '', buy: '1 garlic bulb', woolies: 'W1', wooliesPacks: 1, coles: 'C1', colesPacks: 1 }] });
    const res = await handleImport(post({ shop: request }, 'Bearer user-token'));
    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.a.woolies).toEqual({ productId: 'w1', packs: 1 });
  });

  it('turns away signed-out requests without asking Gemini', async () => {
    const fetchMock = stub({ lines: [] });
    expect((await handleImport(post({ shop: request }))).status).toBe(401);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('googleapis'))).toBe(false);
  });

  it('refuses a malformed list', async () => {
    stub({ lines: [] });
    expect((await handleImport(post({ shop: { lines: [] } }, 'Bearer user-token'))).status).toBe(400);
  });

  it('tries the next model when an answer is unreadable, and reports it if none do better', async () => {
    const fetchMock = stub({ nope: true });
    const res = await handleImport(post({ shop: request }, 'Bearer user-token'));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/unreadable answer/);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('googleapis')).length).toBeGreaterThan(1);
  });
});
