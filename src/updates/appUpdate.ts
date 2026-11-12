/**
 * Android: checks GitHub for a newer test build and installs it.
 *
 * The app is sideloaded (not from the Play Store), so Android won't let it
 * update itself silently. The best we can do is download the new APK and open
 * Android's installer, where the person taps "Update". The first time, Android
 * also asks them to allow installs from Nacho Cookbook.
 */
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';
import { useSyncExternalStore } from 'react';

import {
  APK_FALLBACK_URL,
  isNewer,
  parseBuild,
  parseLatestRelease,
  RELEASES_API,
  type LatestRelease,
} from '@/src/core/appUpdate';

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'installing';

export type UpdateState = {
  /** Version code of the installed app; null in development builds. */
  installed: number | null;
  latest: LatestRelease | null;
  available: boolean;
  phase: UpdatePhase;
  /** 0..1 while downloading, or null when the size isn't known. */
  progress: number | null;
  error: string | null;
  checkedAt: number | null;
};

export const updatesSupported = true;

const CHECK_EVERY_MS = 60 * 60 * 1000;
const FLAG_GRANT_READ_URI_PERMISSION = 1;

let state: UpdateState = {
  // Development builds all have version code 1 and would always look out of date.
  installed: __DEV__ ? null : parseBuild(Application.nativeBuildVersion),
  latest: null,
  available: false,
  phase: 'idle',
  progress: null,
  error: null,
  checkedAt: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  state.available = isNewer(state.latest, state.installed);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAppUpdate(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}

const apkFile = (build: number) => new File(Paths.cache, `nacho-cookbook-${build}.apk`);

/** Deletes downloaded APKs for builds that are already installed. */
function cleanOldDownloads() {
  try {
    for (const entry of Paths.cache.list()) {
      const m = /^nacho-cookbook-(\d+)\.apk$/.exec(entry.name);
      if (m && entry instanceof File && (state.installed == null || Number(m[1]) <= state.installed)) entry.delete();
    }
  } catch {
    // Nothing to clean, or the cache folder isn't readable: harmless.
  }
}

/**
 * Asks GitHub for the latest release. Skips the network when it checked within
 * the last hour, unless `force` (the Settings button) is set.
 */
export async function checkForUpdate(force = false): Promise<UpdateState> {
  if (state.installed == null || state.phase !== 'idle') return state;
  if (!force && state.checkedAt != null && Date.now() - state.checkedAt < CHECK_EVERY_MS) return state;
  if (state.checkedAt == null) cleanOldDownloads();
  set({ phase: 'checking', error: null });
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const latest = parseLatestRelease(await res.json());
    set({ latest, phase: 'idle', checkedAt: Date.now() });
  } catch {
    set({ phase: 'idle', error: force ? 'Couldn’t check for updates. Are you online?' : null });
  }
  return state;
}

/** Downloads the newer APK (once) and opens Android's installer for it. */
export async function installUpdate(): Promise<void> {
  const latest = state.latest;
  if (!latest || !state.available || state.phase !== 'idle') return;
  set({ error: null });
  try {
    const file = apkFile(latest.build);
    const complete = file.exists && (latest.apkSize == null || file.size === latest.apkSize);
    if (!complete) {
      set({ phase: 'downloading', progress: latest.apkSize ? 0 : null });
      if (file.exists) file.delete();
      await File.downloadFileAsync(latest.apkUrl, file, {
        idempotent: true,
        onProgress: ({ bytesWritten, totalBytes }) => {
          const total = totalBytes > 0 ? totalBytes : latest.apkSize;
          set({ progress: total ? Math.min(1, bytesWritten / total) : null });
        },
      });
    }
    set({ phase: 'installing', progress: null });
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      type: 'application/vnd.android.package-archive',
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
    // Back here means the installer closed without replacing the app (cancelled,
    // or installs from this app aren't allowed yet). The download is kept.
    set({ phase: 'idle' });
  } catch {
    // Fall back to the browser: it downloads the same APK and offers to open it.
    set({
      phase: 'idle',
      progress: null,
      error: 'Couldn’t install the update from inside the app, so it’s downloading in your browser instead. Open it from there to install.',
    });
    Linking.openURL(APK_FALLBACK_URL).catch(() => {});
  }
}
