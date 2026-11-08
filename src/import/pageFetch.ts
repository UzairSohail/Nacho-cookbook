/**
 * Fetching a recipe page safely, shared by the app and the Netlify function.
 * Only public http(s) addresses, a size limit and a time limit, so the web
 * app's helper can't be used to reach private networks or download huge files.
 */

const MAX_BYTES = 5_000_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

/** Recipe sites often refuse requests that don't look like a browser. */
export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
};

export const NO_RECIPE_MESSAGE =
  "Couldn't find a recipe on that page. Check it's the recipe's own page, not a list of recipes, or add it by hand.";

export class ImportError extends Error {
  constructor(
    message: string,
    readonly code: 'bad-url' | 'unreachable' | 'blocked' | 'not-html' | 'too-big' | 'no-recipe',
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/** The address as a URL, adding https:// if it was left off. Throws ImportError for anything that isn't a public web page. */
export function checkUrl(input: string): URL {
  let text = input.trim();
  // Shared text from apps often has words around the link.
  const inText = /https?:\/\/\S+/i.exec(text);
  if (inText) text = inText[0];
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ImportError("That doesn't look like a web address.", 'bad-url');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ImportError('Only web addresses (http or https) can be imported.', 'bad-url');
  }
  if (isPrivateHost(url.hostname)) throw new ImportError('That address is not a public website.', 'bad-url');
  return url;
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes('.') && !h.includes(':')) return true; // localhost and other single names
  if (/\.(local|localhost|internal|lan|home|corp)$/.test(h)) return true;
  if (h.includes(':')) return true; // IPv6 literals: real recipe sites use names
  const ip = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/** Downloads a page's HTML. Follows redirects itself so each hop is checked. */
export async function fetchPage(input: string, fetchImpl: typeof fetch = fetch): Promise<{ html: string; url: string }> {
  let url = checkUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; ; hop++) {
      let res: Response;
      try {
        res = await fetchImpl(url.toString(), { headers: BROWSER_HEADERS, redirect: 'manual', signal: controller.signal });
      } catch {
        throw new ImportError("Couldn't reach that website. Check the address and your connection.", 'unreachable');
      }
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) throw new ImportError('That page redirects too many times.', 'unreachable');
        url = checkUrl(new URL(location, url).toString());
        continue;
      }
      // React Native's fetch follows redirects itself and reports the final page.
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        throw new ImportError('That website refused to share the page with the app.', 'blocked');
      }
      if (!res.ok) throw new ImportError(`That website answered with an error (${res.status}).`, 'unreachable');
      const type = res.headers.get('content-type') ?? '';
      if (type && !/html|xml/i.test(type)) throw new ImportError("That link isn't a web page.", 'not-html');
      const length = Number(res.headers.get('content-length') ?? 0);
      if (length > MAX_BYTES) throw new ImportError('That page is too large to read.', 'too-big');
      const html = await res.text();
      if (html.length > MAX_BYTES) throw new ImportError('That page is too large to read.', 'too-big');
      return { html, url: res.url || url.toString() };
    }
  } finally {
    clearTimeout(timer);
  }
}
