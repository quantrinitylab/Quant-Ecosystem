import { useMemo, useState } from 'react';
import { sanitizeEmailHtml } from '@quant/shared-ui';

/**
 * Repairs UTF-8 bytes that a sending server decoded as Latin-1 — the reason an
 * emoji arrives as `ðŸŽ‰` and an apostrophe as `â€™`.
 *
 * This is a *display* repair, not a security boundary. It was previously named
 * `sanitizeEmailText`, which is why the email renderer trusted it with
 * attacker-controlled `bodyHtml` for so long. Anything bound through
 * `dangerouslySetInnerHTML` must go through {@link useSafeEmailHtml}, which runs
 * this first and DOMPurify last.
 */
export function repairMojibake(text?: string): string {
  if (!text) return '';
  let clean = text;
  try {
    clean = decodeURIComponent(escape(text));
  } catch {
    clean = text
      .replace(/ðŸŽ‰/g, '🎉')
      .replace(/ðŸ‘\s*[\x80-\xBF]?/g, '👍')
      .replace(/ðŸ”¥/g, '🔥')
      .replace(/ðŸš€/g, '🚀')
      .replace(/âœ…/g, '✅')
      .replace(/â ¤ï¸ ?/g, '❤️')
      .replace(/ðŸ˜Š/g, '😊')
      .replace(/ðŸ’¡/g, '💡')
      .replace(/ðŸ’¬/g, '💬')
      .replace(/âš\xa0ï¸ ?/g, '⚠️')
      .replace(/â€™|â€˜/g, "'")
      .replace(/â€œ|â€ /g, '"')
      .replace(/â€“|â€”/g, '—')
      .replace(/â€¦/g, '…');
  }
  return clean.replace(/Â[\u00A0\s]?/g, ' ').replace(/\u00A0/g, ' ');
}

/**
 * Turns raw `bodyHtml` from an inbound message into markup that is safe to bind
 * through `dangerouslySetInnerHTML`: mojibake repaired first, then DOMPurify.
 *
 * Returns '' when there is nothing safe to render — during SSR (DOMPurify needs a
 * DOM, so `sanitizeEmailHtml` fails closed) or when sanitizing left the body
 * empty. Callers must treat '' as "render the plain-text fallback".
 *
 * The DOM check is a lazy initial state rather than an effect on purpose: message
 * bodies are fetched in the browser, so no server render ever holds one, and
 * deferring to an effect would flash the plain-text fallback on every open.
 */
export function useSafeEmailHtml(html?: string): string {
  const [hasDom] = useState(() => typeof document !== 'undefined');
  return useMemo(
    () => (hasDom && html ? sanitizeEmailHtml(repairMojibake(html)) : ''),
    [hasDom, html],
  );
}
