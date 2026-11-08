/**
 * Works out what another app shared with us. Chrome shares a page as its
 * address, sometimes with the page title in front; other apps share
 * "Look at this: https://…", and selecting a recipe's text and sharing it sends
 * the text itself, often with a link to the page at the end.
 */
export type SharedRecipe =
  /** A recipe page to import from the web. */
  | { kind: 'url'; url: string }
  /** Recipe text to sort into a recipe, with the page it came from if one was shared too. */
  | { kind: 'text'; text: string; sourceUrl: string | null };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

/** Above this much text besides the link, it's the recipe itself rather than a caption. */
const MAX_CAPTION_CHARS = 200;
const MAX_CAPTION_LINES = 3;

function tidyUrl(raw: string): string {
  // Trailing punctuation from the surrounding sentence, e.g. "(https://…)." or "https://…!".
  let url = raw.replace(/[.,;:!?)\]}>]+$/, '');
  // Chrome's "link to highlighted text" adds #:~:text=…, which is not part of the page.
  url = url.replace(/#:~:text=.*$/, '');
  return url;
}

export function readSharedText(raw: string | null | undefined): SharedRecipe | null {
  const shared = (raw ?? '').replace(/\r\n?/g, '\n').trim();
  if (!shared) return null;

  const urls = shared.match(URL_PATTERN) ?? [];
  const first = urls[0];
  const url = first ? tidyUrl(first) : null;

  // Everything apart from the links, keeping the line breaks the recipe needs.
  const rest = shared
    .replace(URL_PATTERN, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const restLines = rest ? rest.split('\n').filter((l) => l.trim()).length : 0;

  if (url && rest.length <= MAX_CAPTION_CHARS && restLines <= MAX_CAPTION_LINES) {
    return { kind: 'url', url };
  }
  return { kind: 'text', text: rest, sourceUrl: url };
}
