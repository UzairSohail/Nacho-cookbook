/** Android / iOS: the last price file is kept in the app's cache folder for offline use. */
import { File, Paths } from 'expo-file-system';

const file = () => new File(Paths.cache, 'prices.json');

export async function readCachedPrices(): Promise<string | null> {
  const f = file();
  return f.exists ? f.text() : null;
}

export async function writeCachedPrices(text: string): Promise<void> {
  const f = file();
  if (!f.exists) f.create();
  await f.write(text);
}
