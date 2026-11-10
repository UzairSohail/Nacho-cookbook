import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleImport } from '@/src/import/importHandler';
import { checkUrl, fetchPage, ImportError } from '@/src/import/pageFetch';
import wprmBlog from './pages/wprm-blog.html?raw';

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });

describe('checkUrl', () => {
  it('adds https and finds the link in shared text', () => {
    expect(checkUrl('www.example.com/soup').toString()).toBe('https://www.example.com/soup');
    expect(checkUrl('Look at this! https://example.com/cake?x=1 yum').toString()).toBe('https://example.com/cake?x=1');
  });
  it.each(['localhost:3000/x', 'http://127.0.0.1/', 'http://192.168.1.10/', 'http://10.0.0.1', 'http://169.254.169.254/latest', 'http://[::1]/', 'ftp://example.com/x', 'http://printer.local/'])(
    'refuses %s',
    (u) => expect(() => checkUrl(u)).toThrow(ImportError),
  );
});

describe('fetchPage', () => {
  it('follows redirects, checking each hop', async () => {
    const fetchImpl = vi.fn(async (u: string) =>
      u === 'https://example.com/a'
        ? new Response(null, { status: 301, headers: { location: '/b' } })
        : html('<p>hi</p>'),
    ) as unknown as typeof fetch;
    await expect(fetchPage('https://example.com/a', fetchImpl)).resolves.toMatchObject({ html: '<p>hi</p>' });
    const toPrivate = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })) as unknown as typeof fetch;
    await expect(fetchPage('https://example.com/a', toPrivate)).rejects.toMatchObject({ code: 'bad-url' });
  });
  it('explains refusals and non-pages', async () => {
    const blocked = vi.fn(async () => html('no', { status: 403 })) as unknown as typeof fetch;
    await expect(fetchPage('https://example.com', blocked)).rejects.toMatchObject({ code: 'blocked' });
    const pdf = vi.fn(async () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } })) as unknown as typeof fetch;
    await expect(fetchPage('https://example.com/x.pdf', pdf)).rejects.toMatchObject({ code: 'not-html' });
  });
});

describe('the web app import function', () => {
  afterEach(() => vi.unstubAllGlobals());
  const call = (q: string) => handleImport(new Request(`https://example.supabase.co/functions/v1/import-recipe${q}`));
  const post = (body: unknown) =>
    handleImport(new Request('https://example.supabase.co/functions/v1/import-recipe', { method: 'POST', body: JSON.stringify(body) }));

  it('returns just the recipe found on the page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html(wprmBlog)));
    const res = await call(`?url=${encodeURIComponent('https://example.com/red-velvet-cheesecake/')}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipe.title).toBe('Red Velvet Cheesecake');
    expect(body.recipe.ingredients).toHaveLength(3);
  });
  it('says when there is no recipe, or the address is not allowed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html('<h1>About</h1>')));
    expect(await (await call('?url=https://example.com/about')).json()).toMatchObject({ code: 'no-recipe' });
    expect((await call('?url=http://127.0.0.1/')).status).toBe(400);
    expect((await call('')).status).toBe(400);
  });
  it('takes the address in a POST body, as the web app sends it, and answers CORS checks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html(wprmBlog)));
    const res = await post({ url: 'https://example.com/red-velvet-cheesecake/' });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect((await res.json()).recipe.title).toBe('Red Velvet Cheesecake');
    expect((await post({})).status).toBe(400);
    const preflight = await handleImport(new Request('https://example.supabase.co/functions/v1/import-recipe', { method: 'OPTIONS' }));
    expect(preflight.status).toBe(200);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization');
  });
});
