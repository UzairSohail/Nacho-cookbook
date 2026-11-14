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

/**
 * Gemini's "always the current Flash-Lite" name, so the app keeps working when
 * Google retires a version. Flash-Lite answers in seconds; free-tier Flash was
 * often overloaded or took over 30 seconds (checked live 2026-11-11).
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';

/** Longer text than this isn't a recipe (and would eat the free quota). */
export const MAX_TEXT_LENGTH = MAX_AI_TEXT;

/** The AI that answered. */
export type AiName = 'Gemini' | 'Groq';

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
export function recipeFromAnswer(answer: string, sourceUrl = '', aiName?: AiName): ImportedRecipe {
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
    ...(aiName ? { aiName } : {}),
  };
}

/**
 * Models tried in turn when one is overloaded (503), out of free allowance
 * (429), retired (404) or too slow. Free-tier models are often "experiencing
 * high demand"; Flash-Lite is quick and good enough for this. Checked live
 * 2026-11-12: gemini-3.1-flash-lite and gemini-3-flash-preview answer;
 * gemini-2.5-flash, 2.5-flash-lite and 2.0-flash are gone (404) for new keys.
 */
export const FALLBACK_GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-flash-latest'];

/** Busy models get a second go after this pause (a demand spike often passes in seconds). */
const RETRY_PAUSE_MS = 2_000;

/**
 * Groq's free tier, used when every Gemini model fails and the GROQ_API_KEY
 * secret is set (console.groq.com/keys). Override with the GROQ_MODEL secret.
 */
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
/**
 * Groq models tried in turn after the default, when one is rate-limited (each
 * model has its own free allowance), retired or gives an unreadable answer.
 */
export const FALLBACK_GROQ_MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.1-8b-instant'];
/** Time kept back for Groq when Gemini is struggling. */
const GROQ_RESERVE_MS = 15_000;
/** The longest one Groq model gets (Groq usually answers in a second or two). */
const GROQ_PER_MODEL_MS = 20_000;

/** The longest one model gets before the next is tried. */
const PER_MODEL_TIMEOUT_MS = 20_000;

/** One model's failure that is worth trying the next model for. */
class TryNextModel extends Error {}

export interface GeminiOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Groq, tried when Gemini can't answer. */
  groqApiKey?: string;
  groqModel?: string;
  /** Pause before busy models are retried (tests set 0). */
  retryPauseMs?: number;
  /** The longest Gemini gets in all (default GEMINI_TIMEOUT_MS). */
  budgetMs?: number;
}

/**
 * Asks Gemini to sort the text, trying the fallback models in turn, then Groq
 * when a Groq key is set. `fetchImpl` is for tests.
 */
export function sortWithGemini(text: string, sourceUrl: string, options: GeminiOptions = {}): Promise<ImportedRecipe> {
  return askGemini(
    (thinking) => geminiRequest(text.slice(0, MAX_TEXT_LENGTH), { thinking }),
    (answer, by) => recipeFromAnswer(answer, sourceUrl, by),
    options,
  );
}

/**
 * Sends one request to Gemini, trying the fallback models in turn, then the
 * Groq models when a Groq key is set, and reads the answer with `parse` (told
 * which AI answered). `request(false)` must leave out the thinking setting.
 */
export async function askGemini<T>(
  request: (thinking: boolean) => unknown,
  parse: (answer: string, by: AiName) => T,
  options: GeminiOptions = {},
): Promise<T> {
  const { apiKey, model = DEFAULT_GEMINI_MODEL, fetchImpl = fetch, groqApiKey, retryPauseMs = RETRY_PAUSE_MS } = options;
  if (!apiKey && !groqApiKey) throw new AiSortError('AI sorting is not set up yet.', 'not-configured');
  // With Groq to fall back on, Gemini gets less of the time.
  const budget = options.budgetMs ?? GEMINI_TIMEOUT_MS;
  const geminiBudget = groqApiKey ? Math.max(5_000, budget - GROQ_RESERVE_MS) : budget;
  const models = [...new Set([model, ...FALLBACK_GEMINI_MODELS])];
  const started = Date.now();
  const problems: string[] = [];

  const ask = async (name: string, thinking: boolean) => {
    const left = geminiBudget - (Date.now() - started);
    try {
      return await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey ?? '' },
        body: JSON.stringify(request(thinking)),
        signal: AbortSignal.timeout(Math.max(3_000, Math.min(PER_MODEL_TIMEOUT_MS, left))),
      });
    } catch (e) {
      const timedOut = e instanceof Error && e.name === 'TimeoutError';
      throw new TryNextModel(timedOut ? 'too slow' : `unreachable (${e instanceof Error ? `${e.name}: ${e.message}` : e})`.slice(0, 150));
    }
  };

  const sortWith = async (name: string): Promise<T> => {
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
    try {
      return parse(answer, 'Gemini');
    } catch (e) {
      // An answer in the wrong shape: another model may do better.
      if (e instanceof AiSortError && e.code === 'failed') throw new TryNextModel(`unreadable answer (${e.message})`.slice(0, 300));
      throw e;
    }
  };

  // Two rounds: models that were only busy get a second go after a short pause.
  const gone = new Set<string>();
  for (let round = 0; round < 2 && apiKey; round += 1) {
    const left = models.filter((m) => !gone.has(m));
    if (!left.length) break;
    if (round > 0) {
      if (Date.now() - started + retryPauseMs > geminiBudget - 5_000) break;
      await new Promise((r) => setTimeout(r, retryPauseMs));
    }
    for (const name of left) {
      if (Date.now() - started > geminiBudget - 3_000) break;
      try {
        return await sortWith(name);
      } catch (e) {
        if (!(e instanceof TryNextModel)) throw e;
        problems.push(`${name}: ${e.message}`);
        // Retired or refused models won't come back in a few seconds.
        if (/^(404|400)/.test(e.message)) gone.add(name);
      }
    }
  }
  if (groqApiKey) {
    // Groq gets what's left of the time, plus a little: the app waits longer than this.
    const end = started + budget + 5_000;
    const groqModels = [...new Set([options.groqModel || DEFAULT_GROQ_MODEL, DEFAULT_GROQ_MODEL, ...FALLBACK_GROQ_MODELS])];
    for (const name of groqModels) {
      const left = end - Date.now();
      if (left < 4_000) break;
      let answer: string;
      try {
        answer = await askGroq(request(true), { apiKey: groqApiKey, model: name, fetchImpl, ms: Math.min(GROQ_PER_MODEL_MS, left) });
      } catch (e) {
        const timedOut = e instanceof Error && e.name === 'TimeoutError';
        problems.push(`groq ${name}: ${timedOut ? 'too slow' : e instanceof Error ? e.message : String(e)}`.slice(0, 200));
        continue;
      }
      try {
        return parse(answer, 'Groq');
      } catch (e) {
        if (!(e instanceof AiSortError) || e.code !== 'failed') throw e;
        problems.push(`groq ${name}: unreadable answer (${e.message})`.slice(0, 200));
      }
    }
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const who = !groqApiKey ? 'Gemini' : apiKey ? 'Neither Gemini nor Groq' : 'Groq';
  if (problems.length && problems.every((p) => /: 429/.test(p)))
    throw new AiSortError(`The free ${groqApiKey && apiKey ? 'AI' : who} allowance is used up for now.`, 'busy');
  throw new AiSortError(`${who} couldn't answer after ${seconds}s (${problems.join('; ')}).`, 'failed');
}

/**
 * Asks Groq (OpenAI-style API) the same thing as a Gemini request: its
 * instructions, its text, and its answer schema written into the prompt
 * (Groq's JSON mode takes no schema). Returns the JSON text.
 */
export async function askGroq(
  geminiBody: unknown,
  opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch; ms?: number },
): Promise<string> {
  const body = geminiBody as {
    systemInstruction?: { parts?: { text?: string }[] };
    contents?: { parts?: { text?: string }[] }[];
    generationConfig?: { responseSchema?: unknown };
  };
  const system = body.systemInstruction?.parts?.map((p) => p.text ?? '').join('\n') ?? '';
  const user = body.contents?.map((c) => c.parts?.map((p) => p.text ?? '').join('\n')).join('\n\n') ?? '';
  const schema = body.generationConfig?.responseSchema;
  const res = await (opts.fetchImpl ?? fetch)('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model || DEFAULT_GROQ_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${system}${schema ? `\n\nAnswer with one JSON object only, in this shape (an OpenAPI-style schema; give every required field): ${JSON.stringify(schema)}` : ''}`,
        },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(Math.max(3_000, opts.ms ?? 30_000)),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${/"message":\s*"([^"]+)"/.exec(detail)?.[1]?.slice(0, 80) ?? ''}`.trim());
  }
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const answer = data?.choices?.[0]?.message?.content ?? '';
  if (!answer) throw new Error('no answer');
  return answer;
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

/**
 * A quick health check of the Groq setup (GET import-recipe?check=groq): looks
 * the model up, then asks it for a one-word reply, timing both. Says nothing
 * about the key itself.
 */
export async function checkGroq(options: { apiKey?: string; model?: string; fetchImpl?: typeof fetch } = {}) {
  const { apiKey, model = DEFAULT_GROQ_MODEL, fetchImpl = fetch } = options;
  if (!apiKey) return { model, keySet: false };
  const timed = async (url: string, init: RequestInit) => {
    const started = Date.now();
    try {
      const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
      const text = await res.text();
      return { status: res.status, ms: Date.now() - started, body: text.slice(0, 400) };
    } catch (e) {
      return { ms: Date.now() - started, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
    }
  };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
  const lookup = await timed(`https://api.groq.com/openai/v1/models/${encodeURIComponent(model)}`, { headers });
  const reply = await timed('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: 'user', content: 'Reply with the word ok.' }] }),
  });
  return { model, keySet: true, lookup, reply };
}
