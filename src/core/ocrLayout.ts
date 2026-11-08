/**
 * Turning text recognised in a photo of a recipe into plain text that the
 * paste-text reader understands.
 *
 * Text recognition gives blocks of lines with their position on the page, in
 * no reliable order. Cookbooks often put the ingredients in one column and
 * the method in another, so the blocks are put in reading order column by
 * column, and lines that are only a wrapped part of a sentence are joined
 * back together so each step stays one step.
 */

export interface OcrBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrLine extends OcrBox {
  text: string;
}

export interface OcrBlock extends OcrBox {
  lines: OcrLine[];
}

const AMOUNT_START = /^([-•*·▢☐□]\s*)?(\d|[½⅓⅔¼¾⅛⅜⅝⅞]|a |an |one |two |three |pinch |handful |dash )/i;
const NUMBERED = /^(step\s*)?\d+\s*[.)]\s+\S|^step\s+\d+/i;
const BULLET = /^[-•*·▢☐□]\s*/;

/** A short heading line such as "Ingredients", "METHOD" or "For the sauce:". */
const looksLikeHeading = (t: string) =>
  t.length <= 40 && t.split(/\s+/).length <= 5 && !/[.!?,]$/.test(t) && !AMOUNT_START.test(t) && (/:$/.test(t) || /^[A-Z]/.test(t));

/** How much two boxes share horizontally, as a share of the narrower one. */
function xOverlap(a: OcrBox, b: OcrBox): number {
  const overlap = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const narrower = Math.min(a.width, b.width) || 1;
  return Math.max(0, overlap) / narrower;
}

/** The widest empty gap across the blocks along one axis, and where it is. */
function widestGap(blocks: OcrBlock[], axis: 'x' | 'y'): { size: number; at: number } | undefined {
  const start = (b: OcrBox) => (axis === 'x' ? b.left : b.top);
  const end = (b: OcrBox) => (axis === 'x' ? b.left + b.width : b.top + b.height);
  const sorted = [...blocks].sort((a, b) => start(a) - start(b));
  let reach = end(sorted[0]);
  let best: { size: number; at: number } | undefined;
  for (const b of sorted.slice(1)) {
    const gap = start(b) - reach;
    if (gap > 0 && (!best || gap > best.size)) best = { size: gap, at: start(b) };
    reach = Math.max(reach, end(b));
  }
  return best;
}

/**
 * Puts blocks in reading order by cutting the page at its widest empty gap,
 * again and again (a recursive XY cut). The gutter between two columns is
 * usually wider than the space between paragraphs, so a two-column page is
 * cut into columns, read left then right, while a title across the top is cut
 * off first.
 */
export function orderBlocks(blocks: OcrBlock[]): OcrBlock[] {
  const withText = blocks.filter((b) => b.lines.some((l) => l.text.trim()));
  const cut = (bs: OcrBlock[]): OcrBlock[] => {
    if (bs.length < 2) return bs;
    const across = widestGap(bs, 'x');
    const down = widestGap(bs, 'y');
    // Prefer a column gutter over a paragraph gap of a similar size.
    const useX = across && (!down || across.size * 1.5 >= down.size);
    const gap = useX ? across : down;
    if (!gap) return [...bs].sort((a, b) => a.top - b.top || a.left - b.left);
    const before = (b: OcrBlock) => (useX ? b.left : b.top) < gap.at;
    return [...cut(bs.filter(before)), ...cut(bs.filter((b) => !before(b)))];
  };
  return cut(withText);
}

/**
 * The lines of one block, with wrapped lines joined. A list (most lines start
 * with an amount or a bullet) keeps its lines and only joins a line that
 * carries on from the one above. Prose (a method paragraph) becomes one line,
 * starting a new line at each step number.
 */
export function blockLines(block: OcrBlock): string[] {
  const lines = block.lines
    .map((l) =>
      l.text
        .replace(/\s+/g, ' ')
        .trim()
        // Recognition often drops the space after an amount: "3eggs", "250g".
        .replace(/^(\d+(?:[./]\d+)?)(?=[a-z]{2,})/i, '$1 '),
    )
    .filter(Boolean);
  if (!lines.length) return [];
  const out: string[] = [];
  // A heading on the block's first line stays on its own.
  let body = lines;
  if (lines.length > 1 && looksLikeHeading(lines[0]) && !looksLikeHeading(lines[1])) {
    out.push(lines[0]);
    body = lines.slice(1);
  }
  const listy = body.filter((l) => (AMOUNT_START.test(l) && !NUMBERED.test(l)) || BULLET.test(l)).length >= Math.max(2, body.length / 2);
  const avgLength = body.reduce((n, l) => n + l.length, 0) / body.length;
  const prose = !listy && body.length > 1 && (avgLength > 30 || NUMBERED.test(body[0]));

  const first = out.length;
  for (const line of body) {
    const prev = out.length > first ? out[out.length - 1] : undefined;
    const marked = NUMBERED.test(line) || BULLET.test(line);
    const carriesOn = /^[a-z(]/.test(line) || /[-,(&]$|\b(and|or|of|to|the|a|with|into|until)$/i.test(prev ?? '');
    const join = prev !== undefined && !marked && (prose || (carriesOn && !AMOUNT_START.test(line)));
    if (!join) out.push(line);
    else out[out.length - 1] = prev.endsWith('-') && /^[a-z]/.test(line) ? prev.slice(0, -1) + line : `${prev} ${line}`;
  }
  return out;
}

export interface OcrWord extends OcrBox {
  text: string;
}

/**
 * Splits a recognised line where its words have a wide gap between them.
 * Tesseract sometimes reads straight across two columns, giving lines like
 * "1 cup yoghurt 1. Preheat the oven"; the gap between the columns is much
 * wider than a space between words.
 */
export function splitAtGaps(words: OcrWord[]): OcrLine[] {
  const ws = words.filter((w) => w.text.trim()).sort((a, b) => a.left - b.left);
  if (!ws.length) return [];
  const height = Math.max(...ws.map((w) => w.height));
  const out: OcrWord[][] = [[ws[0]]];
  for (let i = 1; i < ws.length; i++) {
    const prev = ws[i - 1];
    const gap = ws[i].left - (prev.left + prev.width);
    if (gap > height * 1.5) out.push([ws[i]]);
    else out[out.length - 1].push(ws[i]);
  }
  return out.map((seg) => {
    const left = Math.min(...seg.map((w) => w.left));
    const top = Math.min(...seg.map((w) => w.top));
    const right = Math.max(...seg.map((w) => w.left + w.width));
    const bottom = Math.max(...seg.map((w) => w.top + w.height));
    return { text: seg.map((w) => w.text.trim()).join(' '), left, top, width: right - left, height: bottom - top };
  });
}

/**
 * Groups loose lines into paragraphs: a line joins the paragraph whose last
 * line sits just above it in the same column. A wider gap, as between list
 * items or method steps set apart, starts a new paragraph.
 */
export function linesToBlocks(lines: OcrLine[]): OcrBlock[] {
  const blocks: OcrBlock[] = [];
  for (const line of [...lines].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const target = blocks.find((b) => {
      const last = b.lines[b.lines.length - 1];
      const gap = line.top - (last.top + last.height);
      // The taller of the two: a line without descenders ("g", "p") measures short.
      const lineHeight = Math.max(last.height, line.height);
      return gap < lineHeight * 0.75 && gap > -lineHeight * 0.5 && Math.abs(line.left - b.left) < lineHeight * 2 && xOverlap(b, line) > 0.3;
    });
    if (target) {
      target.lines.push(line);
      const right = Math.max(target.left + target.width, line.left + line.width);
      target.left = Math.min(target.left, line.left);
      target.width = right - target.left;
      target.height = line.top + line.height - target.top;
    } else {
      blocks.push({ left: line.left, top: line.top, width: line.width, height: line.height, lines: [line] });
    }
  }
  return blocks;
}

/** Text for the paste-text reader: blocks in reading order, a blank line between them. */
export function ocrToText(blocks: OcrBlock[]): string {
  return orderBlocks(blocks)
    .map((b) => blockLines(b).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}
