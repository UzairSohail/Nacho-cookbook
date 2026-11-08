/**
 * Where recipe photos live. A recipe's photo is either
 *
 * - a web address (a photo found by URL import, shown straight from that site), or
 * - a path in the household's "recipe-photos" storage folder:
 *   "<household id>/<photo id>.jpg" (photos taken or picked in the app).
 *
 * Kept free of React Native imports so it can be unit tested.
 */
import { uuid, type Recipe } from '@/src/core';

export const PHOTO_BUCKET = 'recipe-photos';

/** A photo shown from a web address rather than our storage. */
export const isWebPhoto = (p: string) => /^(https?:|data:|blob:|file:)/i.test(p);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A storage path that can be uploaded: inside a real household's folder. Demo
 * mode uses the household id "demo", whose photos stay on the device.
 */
export const isUploadablePath = (p: string) => !isWebPhoto(p) && UUID.test(p.split('/')[0] ?? '');

export const newPhotoPath = (householdId: string) => `${householdId}/${uuid()}.jpg`;

/** Every photo a recipe uses: cover first, then step photos. */
export function recipePhotos(r: Pick<Recipe, 'photoUrls' | 'steps'> | undefined): string[] {
  if (!r) return [];
  const all = [...(r.photoUrls ?? []), ...r.steps.map((s) => s.photoUrl).filter((p): p is string => !!p)];
  return [...new Set(all)];
}

/** Stored photos in `before` that are no longer used, so they can be deleted. */
export function unusedPhotos(before: Iterable<string>, stillUsed: Iterable<string>): string[] {
  const keep = new Set(stillUsed);
  return [...new Set(before)].filter((p) => !keep.has(p) && !isWebPhoto(p));
}

/** Longest side of a saved photo, in pixels. Big enough for a tablet, small enough to sync quickly. */
export const MAX_PHOTO_SIDE = 1600;

/** The resize that fits a photo inside MAX_PHOTO_SIDE, or null if it already fits. */
export function fitSize(width: number, height: number): { width: number } | { height: number } | null {
  if (width <= MAX_PHOTO_SIDE && height <= MAX_PHOTO_SIDE) return null;
  return width >= height ? { width: MAX_PHOTO_SIDE } : { height: MAX_PHOTO_SIDE };
}
