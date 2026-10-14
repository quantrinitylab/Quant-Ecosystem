// ============================================================================
// QuantMail - Email snippet (the stored one-line preview)
//
// Every list (People, Inbox, Sent, Drafts, Scheduled, folders) reads
// `Email.snippet` for the line under the subject. The delivery copy always had
// one, but the sender's own row — created by compose() and rewritten by every
// draft autosave (PUT /emails/:id) — was stored without it, so a just-sent
// message or a note-to-self showed an empty preview ("You:" in People) and a
// draft's preview never followed its edits.
//
// One builder for every writer: plain text first; otherwise the HTML body with
// style/script blocks, comments, tags and the common entities removed; then
// whitespace collapsed and cut to SNIPPET_MAX code points (never half an emoji).
// ============================================================================

export const SNIPPET_MAX = 140;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
};

/** Visible text of an HTML body, markup removed (not sanitised — preview only). */
export function htmlToPreviewText(html: string): string {
  return html
    .replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, ' ')
    .replace(/<!--[\s\S]*?(-->|$)/g, ' ')
    .replace(/<\/?[a-zA-Z][^>]*(>|$)/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39|#x27);/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
}

/**
 * The snippet to store for a message with these bodies. '' when the message
 * has no text at all (readers fall back to the subject).
 */
export function buildSnippet(
  bodyPlain?: string | null,
  bodyHtml?: string | null,
  max: number = SNIPPET_MAX,
): string {
  const plain = (bodyPlain ?? '').trim();
  const source = plain || htmlToPreviewText(bodyHtml ?? '');
  const flat = source.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length <= max ? flat : chars.slice(0, max).join('').trimEnd();
}
