/**
 * Recipes in Instagram posts. Lots of cooks put the whole recipe in a post's
 * caption, and the Instagram app won't let you copy it. Instagram's public
 * embed page (the one websites use to show a post) has the caption as plain
 * text, so the app opens that page and reads the caption from it.
 *
 * This file is the pure part: spotting Instagram links, the embed page's
 * address, and tidying a caption so the paste-text reader can sort it.
 */

import { parse } from 'node-html-parser';

export type InstagramPost = {
  /** The post's code, e.g. "C272uxmAVe3" in instagram.com/reel/C272uxmAVe3/. */
  code: string;
  /** The post's own address, without tracking parameters, kept as the recipe's source. */
  url: string;
  /** Instagram's public embed page for the post, with the caption. */
  embedUrl: string;
};

const HOSTS = /^(www\.|m\.)?(instagram\.com|instagr\.am)$/i;

/**
 * The Instagram post a link points to, or null for anything else (other
 * sites, profiles, stories). Handles links shared from the app, such as
 * https://www.instagram.com/reel/C272uxmAVe3/?igsh=abc, and the
 * instagram.com/<user>/p/<code>/ form.
 */
export function instagramPost(link: string): InstagramPost | null {
  const found = /(?<![\w.-])(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/[^\s<>"']*/i.exec(link.trim());
  if (!found) return null;
  let url: URL;
  try {
    url = new URL(/^https?:/i.test(found[0]) ? found[0] : `https://${found[0]}`);
  } catch {
    return null;
  }
  if (!HOSTS.test(url.hostname)) return null;
  const m = /^\/(?:[A-Za-z0-9._]+\/)?(p|reels?|tv)\/([A-Za-z0-9_-]{5,})/.exec(url.pathname);
  if (!m) return null;
  const kind = m[1] === 'reels' ? 'reel' : m[1];
  const code = m[2];
  return {
    code,
    url: `https://www.instagram.com/${kind}/${code}/`,
    embedUrl: `https://www.instagram.com/${kind === 'tv' ? 'p' : kind}/${code}/embed/captioned/`,
  };
}

/** Only hashtags and @mentions on the line. */
const TAG_LINE = /^([#@][\p{L}\p{N}_.]+[\s,.]*)+$/u;
/** Emoji, arrows and bullets that cooks put in front of ingredients and headings. */
const LEAD = /^[\s\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}•·▪▫◾◽►▶→➡✓✔*-]+/u;

/** "Save this for later!", "Follow @me for more", "Link in bio": not part of the recipe. */
const CALL_TO_ACTION =
  /\b(save (this|it) (for later|post|recipe)|follow (me|@|us|for more)|link in (my |the )?bio|tag (a|someone|your|a friend)|share (this|with)|comment (below|["“']))/i;

/**
 * A caption tidied for the paste-text reader: no hashtag blocks, no emoji
 * bullets in front of ingredients or headings ("🛒 Ingredients:"), no
 * "View all 60 comments", and no runs of blank lines.
 */
export function cleanCaption(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .split('\n')
    // A bullet becomes "- ", which the paste-text reader understands; emoji just go.
    .map((line) => line.replace(LEAD, (lead) => (/[-•·▪▫◾◽*]/.test(lead) ? '- ' : '')))
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => !/^view all [\d,.]+k? comments?$/i.test(line.trim()) && !CALL_TO_ACTION.test(line));

  // Drop hashtag-only lines, which usually close the caption.
  const kept = lines.filter((line) => !TAG_LINE.test(line.trim()));
  // Hashtags trailing the last line of text, e.g. "Enjoy! #pasta #dinner".
  const text = kept
    .join('\n')
    .replace(/(\s+#[\p{L}\p{N}_]+)+\s*$/u, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

/**
 * The caption's text from the embed page's HTML (the whole page, or just its
 * caption element), or null when the page has no caption: a private or deleted
 * post, or a post with no words. Leaves out the account name at the start and
 * the "View all comments" link at the end, and keeps line breaks.
 */
export function captionFromEmbedHtml(html: string): string | null {
  const root = parse(html);
  const caption = root.querySelector('.Caption');
  if (!caption) return null;
  caption.querySelectorAll('.CaptionUsername, .CaptionComments').forEach((el) => el.remove());
  // Line breaks are <br>s; everything else is inline text and links.
  const marked = caption.innerHTML.replace(/<br\s*\/?>/gi, '\n');
  const text = parse(`<div>${marked}</div>`).text;
  const cleaned = cleanCaption(text);
  return cleaned || null;
}
