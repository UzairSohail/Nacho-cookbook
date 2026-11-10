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

/** The recipe from the AI, or null when it isn't available. Never throws. */
export async function sortWithAi(text: string, sourceUrl: string): Promise<ImportedRecipe | null> {
  if (!supabase) return null;
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return null;
    const { data } = await supabase.functions.invoke<{ recipe?: ImportedRecipe }>(IMPORT_FUNCTION, {
      body: { text, sourceUrl },
      timeout: AI_TIMEOUT_MS,
    });
    const recipe = data?.recipe;
    return recipe && Array.isArray(recipe.ingredients) && recipe.ingredients.length ? recipe : null;
  } catch {
    return null;
  }
}

/**
 * Sorts the text, by AI when possible and by the app's rules otherwise. Throws
 * NoRecipeTextError (from the rules) when no ingredients can be found either way.
 */
export async function sortRecipeText(
  text: string,
  sourceUrl = '',
  ai: (text: string, sourceUrl: string) => Promise<ImportedRecipe | null> = sortWithAi,
): Promise<{ recipe: ImportedRecipe; sortedBy: SortedBy }> {
  const recipe = await ai(text, sourceUrl);
  if (recipe) return { recipe: { ...recipe, sourceUrl: recipe.sourceUrl || sourceUrl }, sortedBy: 'ai' };
  return { recipe: parseRecipeText(text, sourceUrl), sortedBy: 'rules' };
}
