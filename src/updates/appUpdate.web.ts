/** Web: always serves the latest version, so there's nothing to update. */
import type { LatestRelease } from '@/src/core/appUpdate';

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'installing';

export type UpdateState = {
  installed: number | null;
  latest: LatestRelease | null;
  available: boolean;
  phase: UpdatePhase;
  progress: number | null;
  error: string | null;
  checkedAt: number | null;
};

export const updatesSupported = false;

const state: UpdateState = {
  installed: null,
  latest: null,
  available: false,
  phase: 'idle',
  progress: null,
  error: null,
  checkedAt: null,
};

export const useAppUpdate = (): UpdateState => state;
export const checkForUpdate = async (_force = false): Promise<UpdateState> => state;
export const installUpdate = async (): Promise<void> => {};
