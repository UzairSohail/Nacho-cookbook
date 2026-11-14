/**
 * How recipe amounts are shown: as written, in cups, or in grams and ml.
 * Saved on this device only, like the plan period; each person picks their own.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { MeasureView } from '@/src/core';

const KEY = 'nacho.measureView';
const VIEWS: readonly MeasureView[] = ['written', 'cups', 'metric'];
let view: MeasureView = 'written';
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

let loaded = false;
function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((saved) => {
      if (saved && (VIEWS as readonly string[]).includes(saved)) {
        view = saved as MeasureView;
        notify();
      }
    })
    .catch(() => {});
}

export function setMeasureView(next: MeasureView) {
  loaded = true;
  if (next === view) return;
  view = next;
  notify();
  AsyncStorage.setItem(KEY, next).catch(() => {});
}

const subscribe = (l: () => void) => {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
};
const get = () => view;

export function useMeasureView(): MeasureView {
  return useSyncExternalStore(subscribe, get, get);
}
