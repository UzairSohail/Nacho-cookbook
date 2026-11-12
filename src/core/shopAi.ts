/**
 * Asking AI (Gemini) to turn the shopping list into a sensible shop.
 *
 * Recipes say "3 cloves garlic" and "1 clove garlic"; a shopper buys one bulb.
 * The rules in prices.ts match product names well but can't judge that, so
 * the app can send the list to Gemini with a short list of real products from
 * each store for every line (so the request stays small and Gemini can only
 * pick products that exist). Gemini answers, per line, what to buy, which
 * product at each store, how many, and which lines are the same thing to buy.
 *
 * This file holds the parts both sides share: the request the app sends, the
 * prompt and answer shape the import helper gives Gemini, and how the answer
 * is checked and applied. People's own picks always win over Gemini's.
 */
import {
  findProducts,
  formatSize,
  money,
  STORES,
  type PriceData,
  type Product,
  type StoreId,
} from './prices';

// ---- what the app sends -------------------------------------------------------

export interface ShopAiLine {
  /** The list line's id. */
  id: string;
  name: string;
  /** The total the planned recipes need, as shown on the list ("4 clove", "350 g"), or "" for "some". */
  amount: string;
  /** Recipes that need it, to help tell what kind of thing it is. */
  recipes: string[];
  /** A shortlist of products at each store, best fits first. */
  candidates: Record<StoreId, Product[]>;
}

export interface ShopAiRequest {
  lines: ShopAiLine[];
}

/** Limits that keep one request well inside Gemini's free allowance. */
export const SHOP_AI_LIMITS = { lines: 80, candidates: 8, text: 120 };

/** One list line's signature: when it changes, Gemini's answer for that line is out of date. */
export const lineSignature = (l: { name: string; quantity: number | null; unit: string | null }) =>
  `${l.name.trim().toLowerCase()}|${l.quantity == null ? '' : Math.round(l.quantity * 1000) / 1000}|${(l.unit ?? '').trim().toLowerCase()}`;

/**
 * Products worth showing Gemini for one line at one store: the closest name
 * matches, plus the cheapest per kg/L among good matches (so a bigger, better
 * value pack is on the table too).
 */
export function shortlist(
  name: string,
  catalog: PriceData['stores'][StoreId],
  opts: { produce?: boolean; size?: number } = {},
): Product[] {
  const size = opts.size ?? SHOP_AI_LIMITS.candidates;
  const matches = findProducts(name, catalog, { produce: opts.produce, limit: 40, within: 40 });
  if (!matches.length) return [];
  const out: Product[] = [];
  const add = (p: Product) => {
    if (out.length < size && !out.some((o) => o.id === p.id)) out.push(p);
  };
  for (const m of matches.slice(0, Math.ceil(size * 0.6))) add(m.product);
  const good = matches.filter((m) => m.score >= matches[0].score - 15).map((m) => m.product);
  const perUnit = (p: Product) => p.price / p.size;
  for (const p of [...good].sort((a, b) => perUnit(a) - perUnit(b))) add(p);
  for (const m of matches) add(m.product);
  return out;
}

// ---- the prompt (used by the import helper) ------------------------------------

export const SHOP_INSTRUCTIONS = `You plan a grocery shop at Woolworths and Coles in Australia for a household's meal plan.

You get the shopping list: each line is an ingredient with the total amount the planned recipes need, the recipes it's for, and a shortlist of real products at each store (a ref like W1 or C3, name, pack size, price).

For each line:
- Decide what a sensible home cook would actually buy. Examples: 4 garlic cloves → one garlic head/bulb (a bulb has about 10 cloves), not a 1 kg bag; 3 eggs → the smallest egg carton; 1 tsp of a spice → the smallest jar; "1 onion" → 1 loose onion, not a 1 kg bag.
- Prefer the fresh, plain product the recipe means (fresh garlic, not garlic paste or minced garlic in a jar; plain flour, not a cake mix), unless the line asks for the processed one.
- If two lines are the same thing to buy (e.g. "garlic" and "garlic cloves", "onion" and "brown onion"), buy it once on the first of them, with enough for both, and on the other set sameAs to the first line's ref.
- From each store's shortlist pick the product that is the right thing and the best value for the amount needed. Packs are bought whole; small leftovers are fine, but don't buy far more than needed unless the bigger pack costs less in total. Use "" when nothing in that store's shortlist is the right thing.
- wooliesPacks / colesPacks: how many of the picked product to buy (at least 1).
- buy: a few words a shopper reads that match the products you picked, e.g. "1 garlic bulb", "2 × 400 g tins".
Include every line exactly once.`;

const STRING = { type: 'STRING' };
const INT = { type: 'INTEGER' };

/** The JSON shape Gemini answers in. */
export const SHOP_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    lines: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          line: STRING,
          sameAs: STRING,
          buy: STRING,
          woolies: STRING,
          wooliesPacks: INT,
          coles: STRING,
          colesPacks: INT,
        },
        required: ['line', 'sameAs', 'buy', 'woolies', 'wooliesPacks', 'coles', 'colesPacks'],
        propertyOrdering: ['line', 'sameAs', 'buy', 'woolies', 'wooliesPacks', 'coles', 'colesPacks'],
      },
    },
  },
  required: ['lines'],
};

const STORE_LETTER: Record<StoreId, string> = { woolies: 'W', coles: 'C' };
const STORE_LABEL: Record<StoreId, string> = { woolies: 'Woolworths', coles: 'Coles' };
const clip = (s: string, n = SHOP_AI_LIMITS.text) => s.replace(/\s+/g, ' ').trim().slice(0, n);

/** The list as Gemini reads it. Lines are L1, L2…; products W1… and C1… within each line. */
export function shopPrompt(req: ShopAiRequest): string {
  const out: string[] = ['Shopping list:'];
  req.lines.forEach((l, i) => {
    const recipes = l.recipes.length ? ` (for ${l.recipes.map((r) => clip(r, 60)).join(', ')})` : '';
    out.push('', `L${i + 1}: ${clip(l.name)}, need ${l.amount ? clip(l.amount, 30) : 'some'}${recipes}`);
    for (const s of STORES) {
      const list = l.candidates[s] ?? [];
      out.push(
        `  ${STORE_LABEL[s]}: ${
          list.length
            ? list.map((p, j) => `${STORE_LETTER[s]}${j + 1} ${clip(p.name, 80)}, ${formatSize(p)}, ${money(p.price)}`).join(' | ')
            : 'nothing found'
        }`,
      );
    }
  });
  return out.join('\n');
}

export function shopGeminiRequest(req: ShopAiRequest, { thinking = true }: { thinking?: boolean } = {}) {
  return {
    systemInstruction: { parts: [{ text: SHOP_INSTRUCTIONS }] },
    contents: [{ role: 'user', parts: [{ text: shopPrompt(req) }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: SHOP_RESPONSE_SCHEMA,
      ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
}

/** Checks a request from the app; returns why it's refused, or null when it's fine. */
export function shopRequestProblem(body: unknown): string | null {
  const req = body as ShopAiRequest | null;
  if (!req || !Array.isArray(req.lines) || !req.lines.length) return 'The list is empty.';
  if (req.lines.length > SHOP_AI_LIMITS.lines) return `The list is too long for one go (over ${SHOP_AI_LIMITS.lines} items).`;
  for (const l of req.lines) {
    if (!l || typeof l.id !== 'string' || typeof l.name !== 'string' || typeof l.amount !== 'string') return 'A list line is malformed.';
    if (!Array.isArray(l.recipes) || !l.candidates || typeof l.candidates !== 'object') return 'A list line is malformed.';
    for (const s of STORES) {
      const list = l.candidates[s] ?? [];
      if (!Array.isArray(list) || list.length > SHOP_AI_LIMITS.candidates + 2) return 'Too many products for one line.';
      for (const p of list) {
        if (!p || typeof p.name !== 'string' || !(Number(p.price) > 0) || !(Number(p.size) > 0)) return 'A product is malformed.';
      }
    }
  }
  return null;
}

// ---- the answer -------------------------------------------------------------------

export interface ShopAiStorePick {
  productId: string;
  packs: number;
}

export interface ShopAiLinePlan {
  /** What to buy, in a shopper's words ("1 garlic bulb"). */
  buy: string;
  /** Another line's id when this one is bought with it. */
  coveredBy?: string;
  woolies?: ShopAiStorePick;
  coles?: ShopAiStorePick;
}

/** Gemini's plan, by list line id. */
export type ShopAiPlan = Record<string, ShopAiLinePlan>;

export class ShopAiAnswerError extends Error {}

/**
 * Turns Gemini's answer into a plan for the request's lines, keeping only
 * what checks out: refs to products that were offered, sensible pack counts,
 * and "same as" pointing at a line that is itself bought.
 */
export function planFromAnswer(answer: string, req: ShopAiRequest): ShopAiPlan {
  let data: { lines?: unknown };
  try {
    data = JSON.parse(answer);
  } catch {
    throw new ShopAiAnswerError('The AI answer was not readable.');
  }
  if (!data || !Array.isArray(data.lines)) throw new ShopAiAnswerError('The AI answer was not readable.');
  const lineAt = (ref: unknown) => {
    const m = /^L?(\d+)$/i.exec(String(ref ?? '').trim());
    const i = m ? Number(m[1]) - 1 : -1;
    return i >= 0 && i < req.lines.length ? i : -1;
  };
  const plan: ShopAiPlan = {};
  const sameAs = new Map<number, number>();
  for (const raw of data.lines as Record<string, unknown>[]) {
    const i = lineAt(raw?.line);
    if (i < 0) continue;
    const line = req.lines[i];
    const entry: ShopAiLinePlan = { buy: clip(typeof raw.buy === 'string' ? raw.buy : '', 60) };
    for (const s of STORES) {
      const m = new RegExp(`^${STORE_LETTER[s]}(\\d+)$`, 'i').exec(String(raw[s] ?? '').trim());
      const product = m ? line.candidates[s]?.[Number(m[1]) - 1] : undefined;
      if (!product) continue;
      const packs = Math.round(Number(raw[`${s}Packs`]));
      entry[s] = { productId: product.id, packs: packs >= 1 && packs <= 50 ? packs : 1 };
    }
    const other = lineAt(raw.sameAs);
    if (other >= 0 && other !== i) sameAs.set(i, other);
    plan[line.id] = entry;
  }
  // "Same as" only counts when that line is bought (not itself covered by another).
  for (const [i, other] of sameAs) {
    if (sameAs.has(other) || !plan[req.lines[other].id]) continue;
    const entry = plan[req.lines[i].id];
    entry.coveredBy = req.lines[other].id;
    delete entry.woolies;
    delete entry.coles;
  }
  if (!Object.keys(plan).length) throw new ShopAiAnswerError('The AI answer had no list lines.');
  return plan;
}
