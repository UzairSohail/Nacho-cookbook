/** Web: the browser's own cache keeps the price file, so nothing is stored here. */
export async function readCachedPrices(): Promise<string | null> {
  return null;
}

export async function writeCachedPrices(_text: string): Promise<void> {}
