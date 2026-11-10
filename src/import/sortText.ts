/**
 * Sorting imported recipe text (a pasted recipe, an Instagram caption or words
 * read from a photo) into title, ingredients, method and notes.
 *
 * When signed in and online, the "import-recipe" Supabase Edge Function sorts
 * it with AI (Gemini, see aiSort.ts). Offline, signed out, in demo mode, or if
 * the AI fails or its free allowance is used up, the app's own rules
 * (parseRecipeText) sort it instead, so importing always works.
 */
import { supabase } from '@/src/backend/supabase';
import type { ImportedRecipe } from '@/src/core/recipeImport';
import { parseRecipeText } from '@/src/core/recipeText';
import { IMPORT_FUNCTION } from './pageFetch';

export type SortedBy = 'ai' | 'rules';

/** How long to wait for the AI before using the rules. */
const AI_TIMEOUT_MS = 30_000;

/** The recipe from the AI, or why it isn't available. Never throws. */
export async function sortWithAi(text: string, sourceUrl: string): Promise<{ recipe: ImportedRecipe } | { reason: string }> {
  if (!supabase) return { reason: 'demo mode.' };
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return { reason: 'you’re signed out.' };
    const { data, error } = await supabase.functions.invoke<{ recipe?: ImportedRecipe }>(IMPORT_FUNCTION, {
      body: { text, sourceUrl },
      timeout: AI_TIMEOUT_MS,
    });
    const recipe = data?.recipe;
    if (recipe && Array.isArray(recipe.ingredients) && recipe.ingredients.length) return { recipe };
    // The helper's answer with a message comes back as an error with the response attached.
    const response = (error as { context?: unknown } | null)?.context;
    const body = response instanceof Response ? ((await response.json().catch(() => null)) as { error?: string } | null) : null;
    if (body?.error) return { reason: body.error };
    return { reason: error ? `couldn’t reach the import helper (${error.message}).` : 'the AI found no recipe.' };
  } catch (e) {
    return { reason: `couldn’t reach the import helper (${e instanceof Error ? e.message : String(e)}).` };
  }
}

/**
 * Sorts the text, by AI when possible and by the app's rules otherwise. Throws
 * NoRecipeTextError (from the rules) when no ingredients can be found either way.
 * The rules' recipe carries why AI wasn't used, as aiNote.
 */
export async function sortRecipeText(
  text: string,
  sourceUrl = '',
  ai: (text: string, sourceUrl: string) => Promise<{ recipe: ImportedRecipe } | { reason: string }> = sortWithAi,
): Promise<{ recipe: ImportedRecipe; sortedBy: SortedBy }> {
  const result = await ai(text, sourceUrl);
  if ('recipe' in result) return { recipe: { ...result.recipe, sourceUrl: result.recipe.sourceUrl || sourceUrl }, sortedBy: 'ai' };
  return { recipe: { ...parseRecipeText(text, sourceUrl), aiNote: result.reason }, sortedBy: 'rules' };
}
