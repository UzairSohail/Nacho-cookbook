import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

const TAG = 'cooking-mode';

/** Keeps the phone screen on while cooking mode is open. */
export function useScreenAwake() {
  useEffect(() => {
    activateKeepAwakeAsync(TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(TAG).catch(() => {});
    };
  }, []);
}
