/**
 * Sorting recipe text with AI (Google Gemini). Runs in the "import-recipe"
 * Supabase Edge Function, where the Gemini key is kept as the GEMINI_API_KEY
 * secret (the repo is public, so the key never goes in the app).
 *
 * The text is whatever an import produced: an Instagram caption, pasted text
 * or words read from a photo. Gemini returns the recipe in a fixed JSON shape,
 * which is checked and turned into the same ImportedRecipe the rule-based
 * reader (src/core/recipeText.ts) makes, so the editor treats both alike.
 */
import { MAX_AI_TEXT } from '@/src/core/recipeForAi';
import type { ImportedIngredientGroup, ImportedRecipe, ImportedStepGroup } from '@/src/core/recipeImport';

/** Gemini's "always the current Flash model" name, so the app keeps working when Google retires a version. */
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

/** Longer text than this isn't a recipe (and would eat the free quota). */
export const MAX_TEXT_LENGTH = MAX_AI_TEXT;

export class AiSortError extends Error {
  constructor(
    message: string,
    /** 'not-configured': no key; 'busy': free quota used up; 'no-recipe': no ingredients found; 'failed': anything else. */
    readonly code: 'not-configured' | 'busy' | 'no-recipe' | 'failed',
  ) {
    super(message);
    this.name = 'AiSortError';
  }
}

export const INSTRUCTIONS = `You sort recipe text into a recipe for a cookbook app. The text was copied from an Instagram caption, a website, a note, or read from a photo of a cookbook page, so it may contain emoji, hashtags, promotion, nutrition macros, calls to follow or save the post, broken lines and words misread from a photo.

Rules:
- Copy ingredient lines and steps as written. Don't change amounts or units, don't convert measures, don't invent anything that isn't in the text.
- One ingredient per line, amount first where the text has one ("200g chicken thigh", "2 tbsp soy sauce", "Salt, to taste"). Split lines that list several ingredients. Join an ingredient that was broken over two lines. Fix obvious photo misreads only when certain (e.g. "1OOg" is "100g").
- If the recipe has parts (e.g. "For the sauce", "Marinade", "Chicken"), make one ingredient group per part, with the part name as the heading. Use no heading for a single list.
- Steps go in method groups, in order, without step numbers, bullets or emoji. Give a group a heading only when the text splits the method into parts (e.g. "Sauce", "Assembly", "Storage & reheating").
- If the text has no ingredient list but the steps mention ingredients with amounts, build the ingredient list from the steps.
- Notes are tips, substitutions and storage advice that aren't steps. Leave out hashtags, promotion, macros, links and calls to like, share, save, follow or comment.
- title: the dish's name, short, without emoji. Use "" if there is none.
- description: one or two sentences about the dish from the text, or "".
- servings, prepMinutes, cookMinutes: numbers only when the text says them (a total time with no split counts as cook time); otherwise null.
- If the text isn't a recipe or has no ingredients at all, return empty ingredientGroups.`;

const STRING = { type: 'STRING' };
const NULLABLE_INT = { type: 'INTEGER', nullable: true };

/** The JSON shape Gemini must answer in (Gemini's OpenAPI-style schema). */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: STRING,
    description: STRING,
    servings: NULLABLE_INT,
    prepMinutes: NULLABLE_INT,
    cookMinutes: NULLABLE_INT,
    ingredientGroups: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { heading: STRING, items: { type: 'ARRAY', items: STRING } },
        required: ['heading', 'items'],
      },
    },
    methodGroups: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { heading: STRING, steps: { type: 'ARRAY', items: STRING } },
        required: ['heading', 'steps'],
      },
    },
    notes: { type: 'ARRAY', items: STRING },
  },
  required: ['title', 'description', 'servings', 'prepMinutes', 'cookMinutes', 'ingredientGroups', 'methodGroups', 'notes'],
  propertyOrdering: ['title', 'description', 'servings', 'prepMinutes', 'cookMinutes', 'ingredientGroups', 'methodGroups', 'notes'],
};

/** How long the helper waits for Gemini. Supabase lets a function run for 150 seconds. */
export const GEMINI_TIMEOUT_MS = 55_000;

/**
 * The body of a Gemini generateContent request for this text. Sorting needs
 * little reasoning, so thinking is turned off (thinkingBudget 0), which makes
 * Flash answer in seconds instead of timing out. `thinking: false` leaves the
 * setting out, for models that refuse it.
 */
export function geminiRequest(text: string, { thinking = true }: { thinking?: boolean } = {}) {
  return {
    systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
    contents: [{ role: 'user', parts: [{ text: `Recipe text:\n\n${text}` }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const strings = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const minutes = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 10_000 ? Math.round(v) : undefined);
/** "1. Mix", "Step 2: Mix", "- Mix" → "Mix". */
const withoutNumber = (s: string) => s.replace(/^(?:step\s*)?\d{1,2}\s*[.):\-–]\s*|^[-•*·]\s*/i, '').trim();
const heading = (v: unknown) => str(v).replace(/:+$/, '').trim() || undefined;

/**
 * Turns Gemini's answer (the JSON text) into a recipe. Throws AiSortError
 * 'no-recipe' when there are no ingredients, and 'failed' when the answer
 * isn't the expected JSON.
 */
export function recipeFromAnswer(answer: string, sourceUrl = ''): ImportedRecipe {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(answer);
  } catch {
    throw new AiSortError('The AI answer was not readable.', 'failed');
  }
  if (!data || typeof data !== 'object') throw new AiSortError('The AI answer was not readable.', 'failed');

  const ingredients: ImportedIngredientGroup[] = (Array.isArray(data.ingredientGroups) ? data.ingredientGroups : [])
    .map((g: Record<string, unknown>) => ({ heading: heading(g?.heading), items: strings(g?.items).map((i) => i.replace(/^[-•*·]\s*/, '')) }))
    .filter((g) => g.items.length);
  if (!ingredients.length) throw new AiSortError("Couldn't find any ingredients in that.", 'no-recipe');

  const instructions: ImportedStepGroup[] = (Array.isArray(data.methodGroups) ? data.methodGroups : [])
    .map((g: Record<string, unknown>) => ({ heading: heading(g?.heading), steps: strings(g?.steps).map(withoutNumber).filter(Boolean) }))
    .filter((g) => g.steps.length);

  const servings = minutes(data.servings);
  return {
    title: str(data.title) || 'Pasted recipe',
    description: str(data.description).slice(0, 500) || undefined,
    servings: servings != null && servings <= 100 ? servings : undefined,
    prepMinutes: minutes(data.prepMinutes),
    cookMinutes: minutes(data.cookMinutes),
    ingredients,
    instructions,
    notes: strings(data.notes).map((n) => n.replace(/^[-•*·]\s*/, '')).join('\n') || undefined,
    tags: [],
    sourceUrl,
    foundBy: 'ai',
  };
}

/**
 * Models tried in turn when one is overloaded (503), out of free allowance
 * (429), unknown (404) or too slow. Free-tier Flash is often "experiencing
 * high demand", and Flash-Lite is quick and good enough for sorting.
 */
export const FALLBACK_GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-2.5-flash'];

/** The longest one model gets before the next is tried. */
const PER_MODEL_TIMEOUT_MS = 20_000;

/** One model's failure that is worth trying the next model for. */
class TryNextModel extends Error {}

/** Asks Gemini to sort the text, trying the fallback models in turn. `fetchImpl` is for tests. */
export async function sortWithGemini(
  text: string,
  sourceUrl: string,
  options: { apiKey?: string; model?: string; fetchImpl?: typeof fetch } = {},
): Promise<ImportedRecipe> {
  const { apiKey, model = DEFAULT_GEMINI_MODEL, fetchImpl = fetch } = options;
  if (!apiKey) throw new AiSortError('AI sorting is not set up yet.', 'not-configured');
  const models = [...new Set([model, ...FALLBACK_GEMINI_MODELS])];
  const started = Date.now();
  const problems: string[] = [];

  const ask = async (name: string, thinking: boolean) => {
    const left = GEMINI_TIMEOUT_MS - (Date.now() - started);
    try {
      return await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(geminiRequest(text.slice(0, MAX_TEXT_LENGTH), { thinking })),
        signal: AbortSignal.timeout(Math.max(3_000, Math.min(PER_MODEL_TIMEOUT_MS, left))),
      });
    } catch (e) {
      const timedOut = e instanceof Error && e.name === 'TimeoutError';
      throw new TryNextModel(timedOut ? 'too slow' : `unreachable (${e instanceof Error ? `${e.name}: ${e.message}` : e})`.slice(0, 150));
    }
  };

  const sortWith = async (name: string): Promise<ImportedRecipe> => {
    let response = await ask(name, true);
    // A model that won't take the thinking setting answers 400, sometimes just
    // "Request contains an invalid argument" (Flash-Lite): ask again without it.
    if (response.status === 400) {
      response = await ask(name, false);
      if (response.status === 400) {
        const detail = await response.text().catch(() => '');
        throw new TryNextModel(`400 ${/"message":\s*"([^"]+)"/.exec(detail)?.[1]?.slice(0, 80) ?? ''}`.trim());
      }
    }
    if (response.status === 429 || response.status === 503 || response.status === 404 || response.status >= 500) {
      const detail = await response.text().catch(() => '');
      const message = /"message":\s*"([^"]+)"/.exec(detail)?.[1] ?? '';
      throw new TryNextModel(`${response.status}${message ? ` ${message.slice(0, 80)}` : ''}`);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AiSortError(`Gemini answered ${response.status}: ${detail.slice(0, 300)}`, 'failed');
    }
    const body = (await response.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    } | null;
    const answer = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!answer) throw new TryNextModel(`no answer (${body?.candidates?.[0]?.finishReason ?? 'no candidates'})`);
    return recipeFromAnswer(answer, sourceUrl);
  };

  for (const name of models) {
    if (Date.now() - started > GEMINI_TIMEOUT_MS - 3_000) break;
    try {
      return await sortWith(name);
    } catch (e) {
      if (!(e instanceof TryNextModel)) throw e;
      problems.push(`${name}: ${e.message}`);
    }
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  if (problems.length && problems.every((p) => /: 429/.test(p)))
    throw new AiSortError('The free Gemini allowance is used up for now.', 'busy');
  throw new AiSortError(`Gemini couldn't answer after ${seconds}s (${problems.join('; ')}).`, 'failed');
}

/**
 * A quick health check of the Gemini setup, for troubleshooting from outside
 * the app (GET import-recipe?check=gemini): looks the model up, then asks it
 * for a one-word reply, timing both. Says nothing about the key itself.
 */
export async function checkGemini(options: { apiKey?: string; model?: string; fetchImpl?: typeof fetch } = {}) {
  const { apiKey, model = DEFAULT_GEMINI_MODEL, fetchImpl = fetch } = options;
  if (!apiKey) return { model, keySet: false };
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
  const timed = async (url: string, init: RequestInit) => {
    const started = Date.now();
    try {
      const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(30_000) });
      const text = await res.text();
      return { status: res.status, ms: Date.now() - started, body: text.slice(0, 400) };
    } catch (e) {
      return { ms: Date.now() - started, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
    }
  };
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': apiKey };
  const lookup = await timed(base, { headers });
  const replyWith = (thinkingOff: boolean) =>
    timed(`${base}:generateContent`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with the word ok.' }] }],
        generationConfig: { maxOutputTokens: 20, ...(thinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
      }),
    });
  const reply = await replyWith(true);
  const replyPlain = reply.status === 400 ? await replyWith(false) : undefined;
  return { model, keySet: true, lookup, reply, ...(replyPlain ? { replyPlain } : {}) };
}
