/**
 * Photos waiting to upload from the web app, kept in the browser's IndexedDB
 * so they survive a reload while offline. Once uploaded they are removed; the
 * browser's own cache keeps them for offline viewing after that.
 */
const DB = 'nacho-cookbook-photos';
const STORE = 'photos';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

const objectUrls = new Map<string, string>();

export async function saveLocalPhoto(path: string, uri: string): Promise<void> {
  const blob = await (await fetch(uri)).blob();
  await run('readwrite', (s) => s.put(blob, path));
  objectUrls.set(path, uri.startsWith('blob:') ? uri : URL.createObjectURL(blob));
}

export async function localPhotoUri(path: string): Promise<string | null> {
  const known = objectUrls.get(path);
  if (known) return known;
  const blob = await run<Blob | undefined>('readonly', (s) => s.get(path)).catch(() => undefined);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(path, url);
  return url;
}

export async function readLocalPhoto(path: string): Promise<ArrayBuffer | Blob | null> {
  return (await run<Blob | undefined>('readonly', (s) => s.get(path)).catch(() => undefined)) ?? null;
}

export async function deleteLocalPhoto(path: string): Promise<void> {
  await run('readwrite', (s) => s.delete(path)).catch(() => {});
  // The object URL stays valid for this page so photos on screen don't vanish.
}

export const keepAfterUpload = false;
