/**
 * Importing a recipe from a web address. The Android app fetches the page
 * itself. Browsers block reading other sites' pages (CORS), so the web app
 * asks its Netlify function to fetch the page and find the recipe.
 */
import { Platform } from 'react-native';

import { extractRecipe, NoRecipeFoundError, type ImportedRecipe } from '@/src/core/recipeImport';
import { checkUrl, fetchPage, ImportError, NO_RECIPE_MESSAGE } from './pageFetch';

export { ImportError } from './pageFetch';

export const IMPORT_FUNCTION_PATH = '/.netlify/functions/import-recipe';

export async function importRecipe(input: string): Promise<ImportedRecipe> {
  const url = checkUrl(input);
  if (Platform.OS === 'web') return viaFunction(url.toString());
  const page = await fetchPage(url.toString());
  try {
    return extractRecipe(page.html, page.url);
  } catch (e) {
    if (e instanceof NoRecipeFoundError) throw new ImportError(NO_RECIPE_MESSAGE, 'no-recipe');
    throw e;
  }
}

async function viaFunction(url: string): Promise<ImportedRecipe> {
  let res: Response;
  try {
    res = await fetch(`${IMPORT_FUNCTION_PATH}?url=${encodeURIComponent(url)}`);
  } catch {
    throw new ImportError("Couldn't reach the import service. Check your connection.", 'unreachable');
  }
  const body = (await res.json().catch(() => null)) as { recipe?: ImportedRecipe; error?: string; code?: ImportError['code'] } | null;
  if (res.ok && body?.recipe) return body.recipe;
  if (body?.error) throw new ImportError(body.error, body.code ?? 'unreachable');
  // Running with `expo start` has no Netlify function behind it.
  throw new ImportError('Recipe import is not available here. It works on the hosted web app and on Android.', 'unreachable');
}
