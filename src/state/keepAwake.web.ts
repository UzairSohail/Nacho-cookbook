import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };

/**
 * Keeps the screen on while cooking mode is open, where the browser allows it.
 * Browsers drop the lock when the tab is hidden, so it's asked for again when
 * you come back. Browsers without it just carry on as normal.
 */
export function useScreenAwake() {
  useEffect(() => {
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;
    let lock: Sentinel | null = null;
    let done = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock!
        .request('screen')
        .then((l) => {
          if (done) l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {});
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', request);
      lock?.release().catch(() => {});
    };
  }, []);
}
