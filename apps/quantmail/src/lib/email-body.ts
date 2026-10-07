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
 * Common named HTML entities beyond the core six. Single-pass decoding (below)
 * makes `&amp;` ordering irrelevant — `&amp;lt;` correctly yields `&lt;`.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
  ldquo: '"',
  rdquo: '"',
  lsquo: '\'',
  rsquo: '\'',
  laquo: '«',
  raquo: '»',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  middot: '·',
  bull: '•',
};

/**
 * Decode HTML entities in one pass: named (`&mdash;`), decimal (`&#8212;`)
 * and hex (`&#x2014;`). Unknown entities are left as-is. Single-pass, so a
 * literal `&amp;lt;` can never double-decode to `<`.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (!Number.isNaN(code) && code > 0 && code < 0x110000) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return m;
        }
      }
      return m;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? m;
  });
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
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<hr\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
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
