/**
 * Reading a recipe's text from a photo, on Android: Google ML Kit text
 * recognition runs on the phone, so it works offline and costs nothing. The
 * web app has its own version in photoText.web.ts.
 */
import RecipeOcr from '@/modules/recipe-ocr';
import { ocrToText } from '@/src/core/ocrLayout';

export class PhotoTextError extends Error {}

/** The recipe text in the picture at `uri`, ready for the paste-text reader. */
export async function readPhotoText(uri: string): Promise<string> {
  if (!RecipeOcr) {
    throw new PhotoTextError('Reading photos needs the installed Android app. Update to the newest test build.');
  }
  let blocks;
  try {
    blocks = await RecipeOcr.recognize(uri);
  } catch (e) {
    console.error('Photo import: text recognition failed', e);
    throw new PhotoTextError('Couldn’t read that picture. Try a JPEG or PNG photo.');
  }
  return ocrToText(blocks);
}
