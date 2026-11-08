/**
 * Taking, uploading, showing and deleting recipe photos.
 *
 * A new photo is shrunk, saved on the device and given its storage path
 * straight away, so a recipe can be saved with it while offline. Uploads (and
 * deletes) wait in a queue on the device and go up whenever there is a
 * connection. Other devices show the photo through a signed link, which is
 * remembered for a week so the same link (and the browser's or phone's cached
 * copy of the image) is reused.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/src/backend/supabase';
import { deleteLocalPhoto, keepAfterUpload, localPhotoUri, readLocalPhoto, saveLocalPhoto } from './localPhotos';
import { fitSize, isUploadablePath, isWebPhoto, newPhotoPath, PHOTO_BUCKET } from './paths';

const QUEUE_KEY = 'nacho-cookbook.photo-queue';
const LINKS_KEY = 'nacho-cookbook.photo-links';
const DAY_MS = 24 * 60 * 60 * 1000;
const LINK_DAYS = 7;
const RETRY_MS = 60 * 1000;

// ---- the queue --------------------------------------------------------------

interface Queue {
  uploads: string[];
  deletes: string[];
}

let queue: Queue | null = null;

async function loadQueue(): Promise<Queue> {
  if (queue) return queue;
  let saved: Partial<Queue> = {};
  try {
    saved = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '{}');
  } catch {
    // Start afresh.
  }
  queue ??= { uploads: saved.uploads ?? [], deletes: saved.deletes ?? [] };
  return queue;
}

const saveQueue = (q: Queue) => AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)).catch(() => {});

/** Photos on this device that haven't reached the household yet. */
export async function pendingUploads(): Promise<number> {
  return (await loadQueue()).uploads.length;
}

let flushing: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Sends queued uploads and deletes. Safe to call often. */
export function flushPhotos(): Promise<void> {
  flushing ??= sendQueued().finally(() => {
    flushing = null;
  });
  return flushing;
}

function retryLater() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushPhotos();
  }, RETRY_MS);
}

async function sendQueued(): Promise<void> {
  if (!supabase) return;
  const q = await loadQueue();
  if (!q.uploads.length && !q.deletes.length) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const bucket = supabase.storage.from(PHOTO_BUCKET);

  // New photos can join the queue while this runs; keep going until it's empty.
  for (let path = q.uploads[0]; path; path = q.uploads[0]) {
    const body = await readLocalPhoto(path).catch(() => null);
    if (body) {
      const { error } = await bucket
        .upload(path, body, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
        .catch((e: Error) => ({ error: e }));
      if (error) {
        // Offline, or the storage bucket isn't set up yet: try again later.
        console.warn('Photos: upload failed, will retry', path, error.message);
        retryLater();
        return;
      }
      if (!keepAfterUpload) await deleteLocalPhoto(path);
    }
    // Uploaded, or the photo is gone from this device and can never be sent.
    q.uploads = q.uploads.filter((p) => p !== path);
    await saveQueue(q);
  }

  if (q.deletes.length) {
    const batch = [...q.deletes];
    const { error } = await bucket.remove(batch).catch((e: Error) => ({ error: e }));
    if (error) {
      console.warn('Photos: delete failed, will retry', error.message);
      retryLater();
      return;
    }
    q.deletes = q.deletes.filter((p) => !batch.includes(p));
    await saveQueue(q);
  }
}

let started = false;

/** Starts sending queued photos now, when the app comes back to the front, and when back online. */
export function startPhotoSync() {
  if (started) return;
  started = true;
  void flushPhotos();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void flushPhotos();
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', () => void flushPhotos());
  }
  supabase?.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') void flushPhotos();
  });
}

// ---- adding and removing ----------------------------------------------------

export type PhotoSource = 'camera' | 'library';

/**
 * Opens the camera or the photo library (a file picker on a computer). Returns
 * the new photo's path, or null if the person cancelled. Errors carry a
 * message to show.
 */
export async function pickPhoto(source: PhotoSource, householdId: string): Promise<string | null> {
  if (source === 'camera' && Platform.OS !== 'web') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera access is off for Nacho Cookbook. Turn it on in your phone’s settings to take photos.');
    }
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  try {
    return await addPhoto(asset.uri, householdId);
  } catch (e) {
    console.error('Photos: could not read the picture', e);
    throw new Error('Couldn’t read that picture. Try a JPEG or PNG photo.');
  }
}

/** Shrinks a picture, keeps it on the device and queues it for upload. */
export async function addPhoto(uri: string, householdId: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  let image = await context.renderAsync();
  const size = fitSize(image.width, image.height);
  if (size) {
    context.resize(size);
    image = await context.renderAsync();
  }
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const path = newPhotoPath(householdId);
  await saveLocalPhoto(path, saved.uri);
  if (isUploadablePath(path)) {
    const q = await loadQueue();
    q.uploads.push(path);
    await saveQueue(q);
    void flushPhotos();
  }
  return path;
}

/** Deletes photos no recipe uses any more, from this device and (once online) the household's storage. */
export async function discardPhotos(paths: string[]): Promise<void> {
  const stored = paths.filter((p) => !isWebPhoto(p));
  if (!stored.length) return;
  const q = await loadQueue();
  q.uploads = q.uploads.filter((p) => !stored.includes(p));
  for (const p of stored) {
    await deleteLocalPhoto(p).catch(() => {});
    links?.delete(p);
    if (isUploadablePath(p) && !q.deletes.includes(p)) q.deletes.push(p);
  }
  await saveQueue(q);
  void flushPhotos();
}

// ---- showing ----------------------------------------------------------------

interface Link {
  url: string;
  expires: number;
}

let links: Map<string, Link> | null = null;

async function loadLinks(): Promise<Map<string, Link>> {
  if (links) return links;
  let saved: Record<string, Link> = {};
  try {
    saved = JSON.parse((await AsyncStorage.getItem(LINKS_KEY)) ?? '{}');
  } catch {
    // Start afresh.
  }
  const now = Date.now();
  links ??= new Map(Object.entries(saved).filter(([, l]) => l.expires > now));
  return links;
}

const saveLinks = (m: Map<string, Link>) =>
  AsyncStorage.setItem(LINKS_KEY, JSON.stringify(Object.fromEntries(m))).catch(() => {});

const waiting = new Map<string, Array<(uri: string | null) => void>>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Where to load a photo from: the web address, this device's copy, or a signed
 * link. Offline, falls back to the last link (phones and browsers keep the
 * image cached). Null means there's nothing to show.
 */
export async function photoUri(path: string): Promise<string | null> {
  if (isWebPhoto(path)) return path;
  const local = await localPhotoUri(path).catch(() => null);
  if (local) return local;
  if (!supabase || !isUploadablePath(path)) return null;
  const known = (await loadLinks()).get(path);
  if (known && known.expires - Date.now() > DAY_MS) return known.url;
  return new Promise((resolve) => {
    waiting.set(path, [...(waiting.get(path) ?? []), resolve]);
    // Gather the photos a screen asks for into one request.
    batchTimer ??= setTimeout(signWaiting, 30);
  });
}

const offlineAddress = (path: string) =>
  `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/${PHOTO_BUCKET}/${path}`;

async function signWaiting() {
  batchTimer = null;
  const batch = new Map(waiting);
  waiting.clear();
  const paths = [...batch.keys()];
  const m = await loadLinks();
  const answer = (path: string, uri: string | null) => batch.get(path)?.forEach((r) => r(uri));
  try {
    const { data, error } = await supabase!.storage.from(PHOTO_BUCKET).createSignedUrls(paths, LINK_DAYS * DAY_MS / 1000);
    if (error) throw error;
    const expires = Date.now() + LINK_DAYS * DAY_MS;
    for (const item of data) {
      if (item.path && item.signedUrl && !item.error) m.set(item.path, { url: item.signedUrl, expires });
    }
    await saveLinks(m);
    // A photo another device hasn't uploaded yet has no link: show nothing for now.
    for (const p of paths) answer(p, m.get(p)?.url ?? null);
  } catch {
    // Offline. Phones cache images by photo path (see RecipePhoto), so any
    // address for the photo finds the cached copy; the browser needs the old link.
    for (const p of paths) answer(p, m.get(p)?.url ?? offlineAddress(p));
  }
}
