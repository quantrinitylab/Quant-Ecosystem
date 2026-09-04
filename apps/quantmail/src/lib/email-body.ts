// ============================================================================
// QuantMail — turning what someone typed into the two bodies a message carries
// ============================================================================
//
// A sent message has two halves on the wire, and `POST /emails/compose` takes
// them separately: `bodyText` (what a text-only client shows) and `bodyHtml`
// (what QuantMail's own reader shows). The composer used to set both — and the
// legacy `body` field — to the same string:
//
//     body: compiledBody, bodyText: compiledBody, bodyHtml: compiledBody
//
// which is wrong in two ways that only show up after the mail has gone.
//
//   1. `EmailLetterCard` renders `bodyHtml` through `dangerouslySetInnerHTML`
//      the moment it is non-empty, and that branch has no `whitespace-pre-wrap`
//      — only the plain-text fallback does. Plain text survives DOMPurify
//      unchanged, so a three-paragraph mail arrived as one run-on paragraph.
//      Every line break the sender typed was lost, in their own Sent folder.
//   2. A body containing `<` was markup. Nothing dangerous survives the two
//      sanitizers, but `if x < 3 && y > 4` quietly lost its middle.
//
// So the conversion has to happen somewhere, once. It happens here, and the
// functions are pure and exported so they can be tested without a composer, a
// DOM or a network — which is also why the nl2br in `ConversationalThreadView`
// now calls this instead of hand-rolling its own.
//
// SECURITY NOTE: `escapeHtml` here is not a sanitizer and must not be used as
// one. It is the *encoder* for text this client authored, so that text cannot
// become markup. Third-party HTML (anything that arrived over SMTP) still goes
// through `sanitizeEmailHtml` / DOMPurify on render — see `lib/safe-html.ts`.
// ============================================================================

/**
 * The plain-text signature separator from RFC 3676 §4.3: a line containing
 * exactly "-- ". Real clients use it to tell a signature apart from the message,
 * and QuantMail uses it for one concrete reason of its own — a saved draft comes
 * back as `bodyText`, so without a marker the appended signature would be
 * restored *into* the editable body and appended a second time on the next save.
 *
 * The trailing space is load-bearing. `--` alone is not the delimiter.
 */
export const SIGNATURE_DELIMITER = '-- ';

/** Encode text so it cannot become markup. Not a sanitizer — see the file note. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;') // first, or every entity below gets double-encoded
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render typed plain text as the HTML half of a message.
 *
 * A blank line starts a new paragraph and a single newline is a line break —
 * the same reading of the text that the plain-text branch's `whitespace-pre-wrap`
 * gives, so the two halves of a message say the same thing.
 *
 * Returns '' for empty input rather than `<p></p>`, because the reader treats a
 * non-empty `bodyHtml` as "use the HTML branch" and an empty paragraph there
 * would hide a plain-text body that does exist.
 */
export function plainTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

/**
 * Flatten signature HTML into the plain-text half of the message.
 *
 * Deliberately regex-based rather than DOM-based: this runs inside `buildFinalMessage`,
 * which is also reached from the draft path, and a DOM dependency would make the
 * send path untestable in the `environment: 'node'` suite for no gain. It is a
 * *text extraction*, never a security boundary — the HTML it reads is the user's
 * own saved signature, and the HTML that reaches a reader is sanitized there.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&') // last, mirroring escapeHtml's first
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Remove a signature this client appended, if the text ends with one.
 *
 * Used when a draft is reopened: `bodyText` comes back carrying the signature,
 * and it must not land in the editable body — the signature is appended at send
 * time from the saved default, so a restored copy would both duplicate it and
 * freeze whatever the signature said on the day the draft was written.
 *
 * Splits on the LAST delimiter, so a message that quotes "-- " earlier keeps it.
 */
export function stripTrailingSignature(text: string): string {
  const marker = `\n${SIGNATURE_DELIMITER}\n`;
  const at = text.lastIndexOf(marker);
  if (at === -1) return text;
  return text.slice(0, at).replace(/\s+$/, '');
}

export interface ComposedBodies {
  /** What a text-only client shows, signature included behind the RFC delimiter. */
  bodyText: string;
  /** What QuantMail's reader shows: the same content, as markup. */
  bodyHtml: string;
}

/**
 * Compile the two bodies a send or draft-save carries.
 *
 * `signatureHtml` is the saved default signature, already trimmed, or ''. It is
 * appended here rather than server-side on purpose: a signature the sender cannot
 * see before pressing Send is exactly the invisible behaviour the settings page
 * was until now describing but not performing, and a server-side append would
 * have stacked on top of the composer's own template sign-off block with no way
 * for the sender to notice.
 */
export function composeMessageBodies(body: string, signatureHtml = ''): ComposedBodies {
  const text = body.trim();
  const signature = signatureHtml.trim();
  if (!signature) {
    return { bodyText: text, bodyHtml: plainTextToHtml(text) };
  }

  const signatureText = htmlToPlainText(signature);
  const bodyText = signatureText ? `${text}\n\n${SIGNATURE_DELIMITER}\n${signatureText}` : text;

  // `<hr>` rather than the literal "-- " line: the delimiter is a plain-text
  // convention, and a reader that already draws a rule does not need both.
  const bodyHtml = [plainTextToHtml(text), '<hr />', signature].filter(Boolean).join('\n');

  return { bodyText, bodyHtml };
}
