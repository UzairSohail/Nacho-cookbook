/**
 * Finding a photo for an imported recipe that came without one. Runs in the
 * "import-recipe" Supabase Edge Function (src/import/importHandler.ts).
 *
 * 1. Gemini turns the recipe's name into short photo search phrases
 *    ("The BEST one-pan creamy Tuscan chicken!!" → "creamy tuscan chicken").
 * 2. Free photo libraries are searched: Pexels (good food photos; needs the
 *    free PEXELS_API_KEY secret) and Wikimedia Commons (no key needed).
 * 3. Gemini reads the photos' descriptions and picks the one that shows the
 *    dish, or none if nothing fits (no photo is better than a wrong one).
 *
 * Without Gemini (no key, allowance used up) the cleaned-up name is searched
 * and the best match is picked by its words instead.
 */
import { askGemini, AiSortError, type GeminiOptions } from './aiSort';

export interface PhotoCandidate {
  /** The image itself, ready to show (hotlinked, as photos from recipe sites are). */
  url: string;
  /** What the library says the photo shows. */
  description: string;
  /** Who took it, for the "Photo by" line. */
  credit: string;
  source: 'pexels' | 'wikimedia';
  /** The photo's page on the library's site. */
  pageUrl: string;
}

export interface PhotoOptions extends GeminiOptions {
  pexelsApiKey?: string;
}

/** Each Gemini question gets this long, so a photo turns up within a minute at worst. */
const GEMINI_BUDGET_MS = 20_000;
const SEARCH_TIMEOUT_MS = 8_000;
/** Candidates shown to Gemini. */
const MAX_CANDIDATES = 12;

/** Wikimedia asks API users to say who they are. */
const WIKIMEDIA_AGENT = 'NachoCookbook/1.0 (https://github.com/UzairSohail/Nacho-cookbook)';

const GENERIC_TITLES = /^(pasted recipe|imported recipe|untitled|recipe|new recipe)$/i;

/** The recipe's name without emoji, brackets, hype words and site names: a fallback search phrase. */
export function plainDishName(title: string): string {
  return title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s[|–—-]\s.*$/, ' ')
    .replace(/[^\p{L}\p{N}' &-]+/gu, ' ')
    .replace(
      /\b(the|best|ever|easy|easiest|quick|simple|healthy|homemade|my|our|famous|perfect|ultimate|amazing|delicious|recipe|one[- ]pan|one[- ]pot|minute|minutes|\d+)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** True when the title names a dish worth searching for. */
export function searchableTitle(title: string): boolean {
  const t = title.trim();
  return t.length >= 3 && !GENERIC_TITLES.test(t) && plainDishName(t).length >= 3;
}

// ---- Gemini's two questions ---------------------------------------------------

const QUERY_INSTRUCTIONS = `You help a cookbook app find a photo of a dish in free stock photo libraries (Pexels, Wikimedia Commons).
Given a recipe's name (and some of its ingredients), give 1 to 3 English search phrases for a photo of the finished dish, most specific first, each 1 to 4 words. Describe the food itself: leave out hype words ("best", "easy"), brand names, people's names, cooking gadgets and quantities. The last phrase should be a more general dish that would still look right (e.g. "chicken katsu curry", "katsu curry", "chicken curry rice").
If the name isn't a dish or food, return an empty list.`;

export function photoQueryRequest(title: string, ingredients: string[], { thinking = true } = {}) {
  const items = ingredients.slice(0, 8).join('; ');
  return {
    systemInstruction: { parts: [{ text: QUERY_INSTRUCTIONS }] },
    contents: [{ role: 'user', parts: [{ text: `Recipe name: ${title}${items ? `\nSome ingredients: ${items}` : ''}` }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { queries: { type: 'ARRAY', items: { type: 'STRING' } } },
        required: ['queries'],
      },
      ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
}

export function queriesFromAnswer(answer: string): string[] {
  let data: { queries?: unknown } | null;
  try {
    data = JSON.parse(answer);
  } catch {
    throw new AiSortError('The AI answer was not readable.', 'failed');
  }
  if (!data || !Array.isArray(data.queries)) throw new AiSortError('The AI answer was not readable.', 'failed');
  const seen = new Set<string>();
  return data.queries
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((q) => q.length >= 3 && q.length <= 60 && !seen.has(q) && !!seen.add(q))
    .slice(0, 3);
}

const PICK_INSTRUCTIONS = `You pick the cover photo for a recipe in a cookbook app from a numbered list of stock photos, each described by its library.
Pick the photo most likely to show this dish, cooked and ready to eat (on a plate, in a bowl or pan). A close relative of the dish is fine when nothing matches exactly. Avoid photos of raw ingredients alone, people, restaurants or shop fronts, packaging, menus or text, maps, and drawings.
Answer with the photo's number, or 0 if none of them would look right for this recipe.`;

export function photoPickRequest(title: string, candidates: PhotoCandidate[], { thinking = true } = {}) {
  const list = candidates.map((c, i) => `${i + 1}. ${c.description.slice(0, 200) || '(no description)'}`).join('\n');
  return {
    systemInstruction: { parts: [{ text: PICK_INSTRUCTIONS }] },
    contents: [{ role: 'user', parts: [{ text: `Recipe: ${title}\n\nPhotos:\n${list}` }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { choice: { type: 'INTEGER' } }, required: ['choice'] },
      ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
}

/** The picked candidate's index, or -1 for none. */
export function pickFromAnswer(answer: string, count: number): number {
  let data: { choice?: unknown } | null;
  try {
    data = JSON.parse(answer);
  } catch {
    throw new AiSortError('The AI answer was not readable.', 'failed');
  }
  const choice = typeof data?.choice === 'number' ? data.choice : typeof data?.choice === 'string' ? Number(data.choice) : NaN;
  if (!Number.isInteger(choice) || choice < 0 || choice > count) throw new AiSortError('The AI answer was not readable.', 'failed');
  return choice - 1;
}

/**
 * Without Gemini: the first candidate whose description has most of the
 * phrase's words (Pexels' and Commons' own ranking decide ties), or -1.
 */
export function pickByWords(query: string, candidates: PhotoCandidate[]): number {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return -1;
  let best = -1;
  let bestScore = 0;
  candidates.forEach((c, i) => {
    const text = c.description.toLowerCase();
    const score = words.filter((w) => text.includes(w.replace(/(es|s)$/, ''))).length / words.length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return bestScore >= 0.5 ? best : -1;
}

// ---- the photo libraries ----------------------------------------------------

const stripHtml = (s: string) =>
  s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/** Pexels search (free key from pexels.com/api; 200 searches an hour). */
export async function searchPexels(query: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<PhotoCandidate[]> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape`;
  const res = await fetchImpl(url, { headers: { authorization: apiKey }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Pexels answered ${res.status}`);
  const data = (await res.json()) as {
    photos?: { alt?: string; url?: string; photographer?: string; src?: { large?: string; landscape?: string } }[];
  };
  return (data.photos ?? [])
    .filter((p) => p.src?.large && /^https:\/\/images\.pexels\.com\//.test(p.src.large))
    .map((p) => ({
      url: p.src!.large!,
      // Pexels' alt text, or the words in the photo's page address ("…/photo/spaghetti-bolognese-1279330/").
      description: p.alt?.trim() || (p.url ?? '').replace(/^.*\/photo\/|-?\d+\/?$/g, '').replace(/-/g, ' '),
      credit: `${p.photographer ?? 'A photographer'} on Pexels`,
      source: 'pexels' as const,
      pageUrl: p.url ?? 'https://www.pexels.com',
    }));
}

/** Wikimedia Commons search (no key). Only photos (JPEG/PNG/WebP) big enough for a cover. */
export async function searchWikimedia(
  query: string,
  fetchImpl: typeof fetch = fetch,
  /** For the health check: what Commons sent and why files were left out. */
  report?: { asks: number; files: number; skipped: string[]; continued: string[] },
): Promise<PhotoCandidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '1200',
    iiextmetadatafilter: 'ImageDescription|ObjectName|Artist|LicenseShortName',
  });
  type Meta = Record<string, { value?: unknown } | undefined>;
  type Page = {
    index?: number;
    title?: string;
    imageinfo?: { thumburl?: string; url?: string; descriptionurl?: string; mime?: string; width?: number; height?: number; extmetadata?: Meta }[];
  };
  // Commons hands out image details (thumbnails, descriptions) for only a few
  // files per answer and says "continue" for the rest, so ask again a few times.
  const pages = new Map<string, Page>();
  let more: Record<string, string> | undefined;
  for (let round = 0; round < 4; round += 1) {
    const ask = new URLSearchParams(params);
    for (const [k, v] of Object.entries(more ?? {})) ask.set(k, v);
    const res = await fetchImpl(`https://commons.wikimedia.org/w/api.php?${ask}`, {
      headers: { 'user-agent': WIKIMEDIA_AGENT, 'api-user-agent': WIKIMEDIA_AGENT },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Wikimedia answered ${res.status}`);
    const data = (await res.json()) as { query?: { pages?: Page[] }; continue?: Record<string, string> };
    for (const p of data.query?.pages ?? []) {
      const key = p.title ?? String(p.index);
      const had = pages.get(key);
      pages.set(key, { ...had, ...p, imageinfo: p.imageinfo?.length ? p.imageinfo : had?.imageinfo });
    }
    // Only continue the image details, not on to the next page of search results.
    more = data.continue && 'iicontinue' in data.continue ? data.continue : undefined;
    if (report) {
      report.asks += 1;
      report.continued.push(Object.keys(data.continue ?? {}).join(',') || 'none');
    }
    if (!more) break;
  }
  const meta = (m: Meta | undefined, key: string) => (typeof m?.[key]?.value === 'string' ? stripHtml(m[key]!.value as string) : '');
  if (report) report.files = pages.size;
  return [...pages.values()]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((p) => {
      const info = p.imageinfo?.[0];
      const url = info?.thumburl || info?.url;
      const skip = (why: string) => {
        report?.skipped.push(`${(p.title ?? '?').slice(0, 60)}: ${why}`);
        return [];
      };
      if (!info || !url) return skip('no image details');
      // Commons serves files from upload.wikimedia.org and thumbnails from thumb.wikimedia.org.
      if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url)) return skip(`address ${url.slice(0, 60)}`);
      if (!/^image\/(jpeg|png|webp)$/.test(info.mime ?? '')) return skip(info.mime ?? 'no type');
      if ((info.width ?? 0) < 600 || (info.height ?? 0) < 400) return skip(`${info.width}x${info.height}`);
      const name = (p.title ?? '').replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' ');
      const about = meta(info.extmetadata, 'ImageDescription') || meta(info.extmetadata, 'ObjectName');
      const artist = meta(info.extmetadata, 'Artist').slice(0, 80);
      const license = meta(info.extmetadata, 'LicenseShortName');
      return [
        {
          url,
          description: [name, about].filter(Boolean).join(': ').slice(0, 300),
          credit: `${artist || 'Wikimedia Commons'}${license ? ` (${license})` : ''}, Wikimedia Commons`,
          source: 'wikimedia' as const,
          pageUrl: info.descriptionurl ?? 'https://commons.wikimedia.org',
        },
      ];
    });
}

/** Both libraries' photos for one phrase, Pexels first. A library that fails is skipped. */
export async function searchPhotos(query: string, options: PhotoOptions = {}): Promise<{ found: PhotoCandidate[]; problems: string[] }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const problems: string[] = [];
  const attempt = (name: string, search: () => Promise<PhotoCandidate[]>) =>
    search().catch((e) => {
      problems.push(`${name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120));
      return [] as PhotoCandidate[];
    });
  const [pexels, commons] = await Promise.all([
    options.pexelsApiKey ? attempt('pexels', () => searchPexels(query, options.pexelsApiKey!, fetchImpl)) : Promise.resolve([]),
    attempt('wikimedia', () => searchWikimedia(query, fetchImpl)),
  ]);
  return { found: [...pexels, ...commons], problems };
}

export type PhotoResult = { photo: PhotoCandidate | null; pickedBy: 'ai' | 'words'; note?: string };

/** A photo for the recipe, or null when nothing suitable was found. Never throws. */
export async function findRecipePhoto(title: string, ingredients: string[], options: PhotoOptions = {}): Promise<PhotoResult> {
  const fallback = plainDishName(title);
  const ai = !!(options.apiKey || options.groqApiKey);
  const geminiOptions = { ...options, budgetMs: GEMINI_BUDGET_MS };
  const notes: string[] = [];

  let queries: string[] = [];
  if (ai) {
    try {
      queries = await askGemini((thinking) => photoQueryRequest(title, ingredients, { thinking }), queriesFromAnswer, geminiOptions);
      // Gemini says it isn't food: nothing to look for.
      if (!queries.length) return { photo: null, pickedBy: 'ai', note: 'The AI didn’t recognise a dish in the name.' };
    } catch (e) {
      notes.push(`search phrase: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!queries.length && fallback) queries = [fallback];

  // Search phrase by phrase until there's a decent choice.
  let candidates: PhotoCandidate[] = [];
  let usedQuery = '';
  for (const q of queries) {
    const { found, problems } = await searchPhotos(q, options);
    notes.push(...problems);
    const fresh = found.filter((f) => !candidates.some((c) => c.url === f.url));
    candidates = [...candidates, ...fresh].slice(0, MAX_CANDIDATES);
    if (fresh.length) usedQuery ||= q;
    if (candidates.length >= 4) break;
  }
  if (!candidates.length) return { photo: null, pickedBy: ai ? 'ai' : 'words', note: notes.join('; ') || 'No photos found.' };

  if (ai) {
    try {
      const index = await askGemini(
        (thinking) => photoPickRequest(title, candidates, { thinking }),
        (answer) => pickFromAnswer(answer, candidates.length),
        geminiOptions,
      );
      return { photo: index >= 0 ? candidates[index] : null, pickedBy: 'ai', ...(index < 0 ? { note: 'None of the photos found looked right.' } : {}) };
    } catch (e) {
      notes.push(`pick: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const index = pickByWords(usedQuery || fallback, candidates);
  return { photo: index >= 0 ? candidates[index] : null, pickedBy: 'words', ...(notes.length ? { note: notes.join('; ').slice(0, 400) } : {}) };
}

/**
 * A quick check that the photo libraries answer from the helper
 * (GET import-recipe?check=photos). Searches a fixed word, so it can't be
 * used as a free photo search, and uses no AI.
 */
export async function checkPhotoSources(options: PhotoOptions = {}) {
  const started = Date.now();
  const { found, problems } = await searchPhotos('lasagna', options);
  const report = { asks: 0, files: 0, skipped: [] as string[], continued: [] as string[] };
  const commons = await searchWikimedia('lasagna', options.fetchImpl ?? fetch, report).catch((e) => {
    report.skipped.push(`failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 150));
    return [] as PhotoCandidate[];
  });
  return {
    pexelsKeySet: !!options.pexelsApiKey,
    pexels: found.filter((f) => f.source === 'pexels').length,
    wikimedia: found.filter((f) => f.source === 'wikimedia').length,
    problems,
    ms: Date.now() - started,
    wikimediaDetail: { ...report, kept: commons.map((c) => c.description.slice(0, 80)) },
  };
}
