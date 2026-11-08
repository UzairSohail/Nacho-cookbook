/**
 * Hands an imported recipe from the import screen to the editor, which opens
 * with ?imported=1. Kept in memory: a draft is too big for a route parameter.
 */
import type { RecipeDraft } from './recipeDraft';

let pending: RecipeDraft | null = null;

export const setPendingImport = (draft: RecipeDraft) => {
  pending = draft;
};

/** The waiting draft, if any. Left in place so a re-render reads the same one. */
export const peekPendingImport = () => pending;

export const clearPendingImport = () => {
  pending = null;
};
