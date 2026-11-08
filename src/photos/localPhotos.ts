/**
 * Photos kept on this device (Android and iOS): every photo taken or picked
 * here is saved in the app's documents folder. It is shown from there, works
 * offline, and is uploaded from there. The web build uses localPhotos.web.ts.
 */
import { Directory, File, Paths } from 'expo-file-system';

function folder(): Directory {
  const dir = new Directory(Paths.document, 'recipe-photos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const fileFor = (path: string) => new File(folder(), path.replace(/[^a-zA-Z0-9.-]/g, '_'));

/** Keeps the picked (already resized) photo under its storage path. */
export async function saveLocalPhoto(path: string, uri: string): Promise<void> {
  await new File(uri).copy(fileFor(path), { overwrite: true });
}

/** Something an <Image> can show, or null if this device doesn't have the photo. */
export async function localPhotoUri(path: string): Promise<string | null> {
  const f = fileFor(path);
  return f.exists ? f.uri : null;
}

/** The photo's bytes, for uploading. */
export async function readLocalPhoto(path: string): Promise<ArrayBuffer | Blob | null> {
  const f = fileFor(path);
  if (!f.exists) return null;
  const bytes = await f.bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export async function deleteLocalPhoto(path: string): Promise<void> {
  const f = fileFor(path);
  if (f.exists) f.delete();
}

/** Phones keep their copy after uploading, so photos taken here always show offline. */
export const keepAfterUpload = true;
