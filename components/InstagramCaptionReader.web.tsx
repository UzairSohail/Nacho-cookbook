/**
 * Browsers don't let one website read another's pages, so the web app can't
 * read an Instagram caption itself. The import screen shows the caption page
 * to copy from instead; this stand-in just reports that nothing was read.
 */
import { useEffect } from 'react';

type Props = { embedUrl: string; onDone: (captionHtml: string | null) => void };

export default function InstagramCaptionReader({ onDone }: Props) {
  useEffect(() => onDone(null), []);
  return null;
}
