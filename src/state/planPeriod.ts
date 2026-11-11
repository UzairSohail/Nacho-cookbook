/**
 * Whether the planner and shopping list work a week or a fortnight at a time.
 * Saved on this device only, so it needs no database change; each person in
 * the household picks their own. The planned recipes themselves are shared.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { PlanPeriod } from '@/src/core';

const KEY = 'nacho.planPeriod';
let period: PlanPeriod = 14;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

let loaded = false;
function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((saved) => {
      if (saved === '7' || saved === '14') {
        period = Number(saved) as PlanPeriod;
        notify();
      }
    })
    .catch(() => {});
}

export function setPlanPeriod(next: PlanPeriod) {
  loaded = true;
  if (next === period) return;
  period = next;
  notify();
  AsyncStorage.setItem(KEY, String(next)).catch(() => {});
}

const subscribe = (l: () => void) => {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
};
const get = () => period;

export function usePlanPeriod(): PlanPeriod {
  return useSyncExternalStore(subscribe, get, get);
}

/** "week" or "fortnight", for labels. */
export const periodName = (p: PlanPeriod) => (p === 7 ? 'week' : 'fortnight');
