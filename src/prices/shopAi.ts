/**
 * Gemini's picks for the shopping list (see src/core/shopAi.ts): asking the
 * import helper, and remembering the answer on this device so it isn't asked
 * again until the list changes. Each answer is kept with the signature of the
 * line it was for, so an edited or new line simply falls back to the
 * built-in matching until Gemini is asked again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { supabase } from '@/src/backend/supabase';
import {
  lineSignature,
  shortlist,
  STORES,
  type ListItem,
  type PriceData,
  type ShopAiLine,
  type ShopAiLinePlan,
  type ShopAiPlan,
  type StoreId,
} from '@/src/core';
import { functionError, IMPORT_FUNCTION } from '@/src/import/pageFetch';

const KEY = 'nacho.shopAi.v1';
const AI_TIMEOUT_MS = 70_000;

interface SavedLine extends ShopAiLinePlan {
  sig: string;
}

export interface ShopAiState {
  /** Answers by list line id. */
  lines: Record<string, SavedLine>;
  /** Price file date the answer was made with. */
  priceDate: string | null;
  busy: boolean;
  /** Why the last ask didn't work, if it didn't. */
  error: string | null;
}

let state: ShopAiState = { lines: {}, priceDate: null, busy: false, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<ShopAiState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

let loaded = false;
function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((text) => {
      if (!text) return;
      const saved = JSON.parse(text) as Partial<ShopAiState>;
      if (saved && typeof saved.lines === 'object' && saved.lines) {
        set({ lines: saved.lines as Record<string, SavedLine>, priceDate: saved.priceDate ?? null });
      }
    })
    .catch(() => {});
}

const save = () => {
  AsyncStorage.setItem(KEY, JSON.stringify({ lines: state.lines, priceDate: state.priceDate })).catch(() => {});
};

const subscribe = (l: () => void) => {
  load();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useShopAi(): ShopAiState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Gemini's answer for a line, if it's still about the line as it is now. */
export function aiPlanFor(s: ShopAiState, item: ListItem): ShopAiLinePlan | null {
  const saved = s.lines[item.id];
  if (!saved || saved.sig !== lineSignature(item)) return null;
  // A line bought with another one only holds while that one is still answered.
  if (saved.coveredBy && !s.lines[saved.coveredBy]) return null;
  return saved;
}

/** Lines Gemini hasn't seen as they are now. */
export const linesToAsk = (s: ShopAiState, items: ListItem[]) => items.filter((i) => !aiPlanFor(s, i));

export function forgetShopAi() {
  set({ lines: {}, priceDate: null, error: null });
  save();
}

/**
 * Asks Gemini about the whole list (so it can see which lines are the same
 * thing) and remembers the answer. Never throws; a failure is kept in `error`
 * and the list carries on with the built-in matching.
 */
export async function askShopAi(
  items: ListItem[],
  data: PriceData,
  amountText: (item: ListItem) => string,
): Promise<void> {
  if (state.busy || !items.length) return;
  set({ busy: true, error: null });
  const fail = (error: string) => set({ busy: false, error });
  if (!supabase) return fail('AI picks need you to be signed in (they’re off in demo mode).');
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return fail('Sign in to use AI picks.');
    const lines: ShopAiLine[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      amount: amountText(item),
      recipes: item.sources.slice(0, 4),
      candidates: Object.fromEntries(
        STORES.map((s) => [s, shortlist(item.name, data.stores[s], { produce: item.aisle === 'produce' })]),
      ) as Record<StoreId, ShopAiLine['candidates'][StoreId]>,
    }));
    const { data: body, error } = await supabase.functions.invoke<{ plan?: ShopAiPlan }>(IMPORT_FUNCTION, {
      body: { shop: { lines } },
      timeout: AI_TIMEOUT_MS,
    });
    if (body?.plan && typeof body.plan === 'object') {
      const next: Record<string, SavedLine> = {};
      for (const item of items) {
        const p = body.plan[item.id];
        if (p) next[item.id] = { ...p, sig: lineSignature(item) };
      }
      set({ lines: next, priceDate: data.updated, busy: false, error: null });
      save();
      return;
    }
    if (!error) return fail('Gemini didn’t send any picks back.');
    const { status, message } = await functionError(error);
    fail(status ? `${message ?? 'The AI helper said no'} (status ${status}).` : `Couldn’t reach the AI helper (${error.message}).`);
  } catch (e) {
    fail(`Couldn’t reach the AI helper (${e instanceof Error ? e.message : String(e)}).`);
  }
}
