/**
 * Hands an imported recipe from the import screen to the editor, which opens
 * with ?imported=1. Kept in memory: a draft is too big for a route parameter.
 */
import type { RecipeDraft } from './recipeDraft';

let pending: RecipeDraft | null = null;
/** The text the recipe was translated from, so the editor can show it. */
let original: string | null = null;

export const setPendingImport = (draft: RecipeDraft, originalText?: string) => {
  pending = draft;
  original = originalText?.trim() || null;
};

/** The untranslated text of the waiting draft, when it was translated from pasted text. */
export const peekPendingOriginal = () => original;

/** The waiting draft, if any. Left in place so a re-render reads the same one. */
export const peekPendingImport = () => pending;

export const clearPendingImport = () => {
  pending = null;
  original = null;
};
