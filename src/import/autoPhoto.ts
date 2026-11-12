/**
 * Asking the import helper for a photo when an imported recipe came without
 * one (see src/import/recipePhoto.ts). Signed-in people only; in demo mode,
 * signed out or offline there's simply no photo, as before.
 */
import { supabase } from '@/src/backend/supabase';
import { IMPORT_FUNCTION } from './pageFetch';
import { searchableTitle } from './recipePhoto';

export interface AutoPhoto {
  url: string;
  /** "Jane Doe on Pexels" */
  credit: string;
  pageUrl: string;
}

/** The helper gives Gemini two questions of up to 20 seconds each, plus the searches. */
const TIMEOUT_MS = 65_000;

/** A photo for the recipe, or null. Never throws. */
export async function findPhotoFor(title: string, ingredients: string[]): Promise<AutoPhoto | null> {
  if (!supabase || !searchableTitle(title)) return null;
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return null;
    const { data } = await supabase.functions.invoke<{ photo?: AutoPhoto | null }>(IMPORT_FUNCTION, {
      body: { photoFor: { title: title.trim().slice(0, 200), ingredients: ingredients.slice(0, 8) } },
      timeout: TIMEOUT_MS,
    });
    const photo = data?.photo;
    if (!photo || typeof photo.url !== 'string' || !/^https:\/\//.test(photo.url)) return null;
    return { url: photo.url, credit: String(photo.credit ?? ''), pageUrl: String(photo.pageUrl ?? '') };
  } catch {
    return null;
  }
}
