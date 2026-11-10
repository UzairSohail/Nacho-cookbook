/**
 * Importing a recipe from a web address. The Android app fetches the page
 * itself, then asks the import helper to tidy the recipe with AI when signed in. Browsers block reading other sites' pages (CORS), so the web app
 * asks the "import-recipe" Supabase Edge Function (src/import/importHandler.ts)
 * to fetch the page and find the recipe.
 */
import { Platform } from 'react-native';

import { extractRecipe, NoRecipeFoundError, type ImportedRecipe } from '@/src/core/recipeImport';
import { supabase } from '@/src/backend/supabase';
import { pageText, recipeAsText, withPageDetails } from '@/src/core/recipeForAi';
import { checkUrl, fetchPage, IMPORT_FUNCTION, ImportError, NO_RECIPE_MESSAGE } from './pageFetch';
import { sortWithAi } from './sortText';

export { ImportError } from './pageFetch';

export { IMPORT_FUNCTION } from './pageFetch';

export async function importRecipe(input: string): Promise<ImportedRecipe> {
  const url = checkUrl(input);
  if (Platform.OS === 'web') return viaFunction(url.toString());
  const page = await fetchPage(url.toString());
  let found: ImportedRecipe | null = null;
  try {
    found = extractRecipe(page.html, page.url);
  } catch (e) {
    if (!(e instanceof NoRecipeFoundError)) throw e;
  }
  // Tidied by AI through the import helper when signed in and it's available;
  // otherwise the page's own recipe data as the rules found it.
  const text = found ? recipeAsText(found) : pageText(page.html);
  const ai = text.trim().length >= 40 ? await sortWithAi(text, page.url) : null;
  if (ai) return withPageDetails(ai, found, page.url);
  if (found) return found;
  throw new ImportError(NO_RECIPE_MESSAGE, 'no-recipe');
}

type FunctionBody = { recipe?: ImportedRecipe; error?: string; code?: ImportError['code'] } | null;

async function viaFunction(url: string): Promise<ImportedRecipe> {
  // Demo mode (no Supabase settings) has no helper to ask.
  if (!supabase) throw new ImportError('Recipe import is not available here. It works when signed in, and on Android.', 'unreachable');
  const { data, error } = await supabase.functions.invoke<FunctionBody>(IMPORT_FUNCTION, { body: { url } });
  if (data?.recipe) return data.recipe;
  // A helper answer with a message (no recipe, blocked site...) comes back as an error with the response attached.
  const response = (error as { context?: unknown } | null)?.context;
  const body = response instanceof Response ? ((await response.json().catch(() => null)) as FunctionBody) : null;
  if (body?.error) throw new ImportError(body.error, body.code ?? 'unreachable');
  throw new ImportError("Couldn't reach the import service. Check your connection.", 'unreachable');
}
