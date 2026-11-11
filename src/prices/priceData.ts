/**
 * The daily Woolworths / Coles price file (built by scripts/build-prices.mjs
 * and published with the web app). Loaded once per app session and shared by
 * every screen; on Android the last copy is kept on the phone so the list is
 * still costed offline.
 */
import { useEffect, useState } from 'react';

import { loadPriceData, type PriceData, type PriceFile } from '@/src/core/prices';
import { readCachedPrices, writeCachedPrices } from './priceCache';

export const PRICES_URL = 'https://uzairsohail.github.io/Nacho-cookbook/prices/prices.json';

export type PriceStatus = 'loading' | 'ready' | 'offline' | 'unavailable';

interface PriceState {
  status: PriceStatus;
  data: PriceData | null;
}

let current: PriceState = { status: 'loading', data: null };
let started = false;
const listeners = new Set<(s: PriceState) => void>();

function set(next: PriceState) {
  current = next;
  for (const l of listeners) l(next);
}

const valid = (f: unknown): f is PriceFile =>
  !!f && typeof f === 'object' && typeof (f as PriceFile).updated === 'string' && !!(f as PriceFile).stores;

async function load() {
  // Show the copy saved on the phone straight away, then look for a newer one.
  const cached = await readCachedPrices().catch(() => null);
  let cachedFile: PriceFile | null = null;
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (valid(parsed)) {
        cachedFile = parsed;
        set({ status: 'ready', data: loadPriceData(parsed) });
      }
    } catch {
      // A damaged copy is just ignored.
    }
  }
  try {
    const res = await fetch(PRICES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const file = JSON.parse(text);
    if (!valid(file)) throw new Error('Not a price file');
    if (!cachedFile || file.updated !== cachedFile.updated) {
      set({ status: 'ready', data: loadPriceData(file) });
      writeCachedPrices(text).catch(() => {});
    }
  } catch (e) {
    console.warn('Prices: could not download today’s prices', e);
    if (!current.data) set({ status: cachedFile ? 'ready' : navigatorOffline() ? 'offline' : 'unavailable', data: current.data });
  }
}

const navigatorOffline = () => typeof navigator !== 'undefined' && (navigator as { onLine?: boolean }).onLine === false;

/** Today's prices, loading them the first time any screen asks. */
export function usePriceData(): PriceState {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    if (!started) {
      started = true;
      load().catch(() => set({ status: 'unavailable', data: null }));
    }
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
