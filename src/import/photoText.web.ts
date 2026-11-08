/**
 * Reading a recipe's text from a photo in the web app, with Tesseract running
 * in the browser. The library and its English model (about 15 MB in all) load
 * from a CDN the first time, and the browser caches them after that.
 */
import { linesToBlocks, ocrToText, splitAtGaps } from '@/src/core/ocrLayout';

export class PhotoTextError extends Error {}

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
/** Big enough for small print on a phone photo of a whole page, small enough to read quickly. */
const MAX_SIDE = 2400;

interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface TesseractWorker {
  recognize(
    image: HTMLCanvasElement,
    options: object,
    output: { blocks: boolean; text: boolean },
  ): Promise<{
    data: { blocks: Array<{ paragraphs: Array<{ lines: Array<{ words: Array<{ text: string; bbox: Bbox }> }> }> }> | null };
  }>;
}
interface TesseractGlobal {
  createWorker(lang: string): Promise<TesseractWorker>;
}

let worker: Promise<TesseractWorker> | null = null;

function loadWorker(): Promise<TesseractWorker> {
  worker ??= new Promise<TesseractGlobal>((resolve, reject) => {
    const existing = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
    if (existing) return resolve(existing);
    const script = document.createElement('script');
    script.src = TESSERACT_URL;
    script.async = true;
    script.onload = () => {
      const t = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
      if (t) resolve(t);
      else reject(new Error('Tesseract did not load'));
    };
    script.onerror = () => reject(new Error('Tesseract did not load'));
    document.head.appendChild(script);
  })
    .then((t) => t.createWorker('eng'))
    .catch((e) => {
      worker = null;
      throw e;
    });
  return worker;
}

/** Draws the picture upright (browsers apply the photo's rotation) and not too big. */
async function toCanvas(uri: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = uri;
  await img.decode();
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const box = (b: Bbox) => ({ left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });

/** The recipe text in the picture at `uri`, ready for the paste-text reader. */
export async function readPhotoText(uri: string): Promise<string> {
  let canvas: HTMLCanvasElement;
  try {
    canvas = await toCanvas(uri);
  } catch (e) {
    console.error('Photo import: could not open the picture', e);
    throw new PhotoTextError('Couldn’t open that picture. Try a JPEG or PNG photo.');
  }
  let w: TesseractWorker;
  try {
    w = await loadWorker();
  } catch (e) {
    console.error('Photo import: could not load text recognition', e);
    throw new PhotoTextError('Couldn’t load the photo reader. Check your connection and try again.');
  }
  try {
    const { data } = await w.recognize(canvas, {}, { blocks: true, text: false });
    // Tesseract's own paragraphs can run across two columns, so rebuild them
    // from its words: split lines at wide gaps, then group lines that sit
    // closely under each other.
    const lines = (data.blocks ?? []).flatMap((b) =>
      b.paragraphs.flatMap((p) => p.lines.flatMap((l) => splitAtGaps(l.words.map((w) => ({ ...box(w.bbox), text: w.text }))))),
    );
    return ocrToText(linesToBlocks(lines));
  } catch (e) {
    console.error('Photo import: text recognition failed', e);
    throw new PhotoTextError('Couldn’t read the text in that picture. Try again with a sharper photo.');
  }
}
