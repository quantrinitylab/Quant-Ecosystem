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

// ============================================================================
// Composer formatting (QM-UIUX-081) — real rich text, never raw Markdown
// ============================================================================
//
// The docked composer's Bold button used to wrap the selection in literal
// `**` asterisks inside the plain-text body, and the full composer's toggles
// only restyled the <textarea> — so one composer leaked raw Markdown into
// `bodyText` (and from there into list snippets, thread previews and the
// Contacts mail history), while the other's formatting silently vanished on
// Send. Both defects live at this conversion point, so the fix does too:
//
//   * The editor keeps the user's text as plain text plus a list of format
//     ranges (offsets into that text). No marker characters are ever inserted
//     into the text itself.
//   * `composeMessageBodies` renders those ranges as real HTML tags in
//     `bodyHtml` (`<strong>`, `<em>`, `<u>`, `<s>`, `<ul><li>`) and leaves
//     `bodyText` as clean prose — list lines gain a plain "• " bullet, which
//     is honest plain text, not markup. Snippets derive from `bodyText`, so
//     nothing downstream can show `**` again for composer-sent mail.
//   * Whole-message formatting (the full composer's font/colour/alignment
//     controls, which style the whole textarea) becomes a validated inline
//     `style` on a wrapping <div> in `bodyHtml`.

export type InlineFormatKind = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'list';

/** A formatted span of the plain body text, as offsets into that text. */
export interface InlineFormatRange {
  start: number;
  end: number;
  kind: InlineFormatKind;
}

export interface MessageFormatting {
  /** Per-selection formatting (docked composer). Offsets index the body as passed in, before trimming. */
  inline?: InlineFormatRange[];
  /** Whole-message character toggles (full composer). */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  /** Whole-message presentation; validated before it reaches the HTML. */
  color?: string;
  fontFamily?: string;
  fontSizePx?: number;
  textAlign?: 'left' | 'center' | 'right';
  /**
   * Whole-message list mode (full composer toolbar). Each non-empty line
   * becomes one list item. Only the two literal values are honored — anything
   * else is ignored, never interpolated, so a formatting state can never
   * become a markup-injection vector.
   */
  list?: 'bullet' | 'numbered';
}

const FORMAT_PLACEHOLDER: Record<InlineFormatKind, string> = {
  bold: 'bold text',
  italic: 'italic text',
  underline: 'underlined text',
  strikethrough: 'struck text',
  list: 'list item',
};

function clampRange(range: InlineFormatRange, length: number): InlineFormatRange | null {
  const start = Math.min(Math.max(0, range.start), length);
  const end = Math.min(Math.max(0, range.end), length);
  if (end <= start) return null;
  return { start, end, kind: range.kind };
}

/** Does the union of same-kind ranges cover [start, end] completely? */
function rangesCover(ranges: InlineFormatRange[], kind: InlineFormatKind, start: number, end: number): boolean {
  const spans = ranges
    .filter((r) => r.kind === kind && r.end > start && r.start < end)
    .sort((a, b) => a.start - b.start);
  let covered = start;
  for (const span of spans) {
    if (span.start > covered) return false;
    covered = Math.max(covered, span.end);
    if (covered >= end) return true;
  }
  return covered >= end;
}

function addFormatRange(
  ranges: InlineFormatRange[],
  kind: InlineFormatKind,
  start: number,
  end: number,
): InlineFormatRange[] {
  let merged = { start, end, kind };
  const out: InlineFormatRange[] = [];
  for (const r of ranges) {
    if (r.kind === kind && r.start <= merged.end && merged.start <= r.end) {
      merged = { start: Math.min(merged.start, r.start), end: Math.max(merged.end, r.end), kind };
    } else {
      out.push(r);
    }
  }
  out.push(merged);
  return out.sort((a, b) => a.start - b.start);
}

function subtractFormatRange(
  ranges: InlineFormatRange[],
  kind: InlineFormatKind,
  start: number,
  end: number,
): InlineFormatRange[] {
  const out: InlineFormatRange[] = [];
  for (const r of ranges) {
    if (r.kind !== kind || r.end <= start || r.start >= end) {
      out.push(r);
      continue;
    }
    if (r.start < start) out.push({ start: r.start, end: start, kind });
    if (r.end > end) out.push({ start: end, end: r.end, kind });
  }
  return out;
}

/**
 * Keep format ranges attached to their text across an edit.
 *
 * Computes the common prefix/suffix between the old and new body and maps
 * every range through the changed region: ranges before it are untouched,
 * ranges after it shift by the length delta, a range the edit lands strictly
 * inside grows, and a range the edit swallows is dropped rather than left
 * pointing at unrelated words.
 */
export function adjustRangesForEdit(
  ranges: InlineFormatRange[],
  oldText: string,
  newText: string,
): InlineFormatRange[] {
  if (oldText === newText || ranges.length === 0) return ranges;
  let prefix = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < Math.min(oldText.length - prefix, newText.length - prefix) &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const changeStart = prefix;
  const changeEndOld = oldText.length - suffix;
  const insertedLength = newText.length - prefix - suffix;
  const delta = insertedLength - (changeEndOld - changeStart);

  const out: InlineFormatRange[] = [];
  for (const r of ranges) {
    const start =
      r.start < changeStart ? r.start : r.start >= changeEndOld ? r.start + delta : changeStart;
    const end =
      r.end <= changeStart ? r.end : r.end >= changeEndOld ? r.end + delta : changeStart + insertedLength;
    if (end > start) out.push({ start, end, kind: r.kind });
  }
  return out;
}

/**
 * Apply one formatting-button press to (text, ranges) — the docked composer's
 * Bold / Italic / Underline / Bulleted-list actions.
 *
 * Pure and total: the component keeps no formatting logic of its own, and the
 * returned text NEVER gains marker characters — formatting lives only in the
 * ranges, which `composeMessageBodies` turns into real HTML. Pressing a
 * button over an already-formatted selection removes that formatting
 * (toggle), matching what the button's pressed state promises.
 */
export function applyInlineFormat(
  text: string,
  ranges: InlineFormatRange[],
  start: number,
  end: number,
  kind: InlineFormatKind,
): { text: string; ranges: InlineFormatRange[]; selectionStart: number; selectionEnd: number } {
  const selStart = Math.min(Math.max(0, Math.min(start, end)), text.length);
  const selEnd = Math.min(Math.max(0, Math.max(start, end)), text.length);

  if (kind === 'list') {
    if (selStart === selEnd) {
      const inserted = FORMAT_PLACEHOLDER.list;
      const nextText = text.slice(0, selStart) + inserted + text.slice(selEnd);
      const adjusted = adjustRangesForEdit(ranges, text, nextText);
      const lineStart = nextText.lastIndexOf('\n', selStart - 1) + 1;
      const nl = nextText.indexOf('\n', selStart + inserted.length);
      const lineEnd = nl === -1 ? nextText.length : nl;
      return {
        text: nextText,
        ranges: addFormatRange(adjusted, 'list', lineStart, lineEnd),
        selectionStart: selStart,
        selectionEnd: selStart + inserted.length,
      };
    }
    const lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
    const effectiveEnd = selEnd > selStart && text[selEnd - 1] === '\n' ? selEnd - 1 : selEnd;
    const nl = text.indexOf('\n', effectiveEnd);
    const lineEnd = nl === -1 ? text.length : nl;
    return {
      text,
      ranges: rangesCover(ranges, 'list', lineStart, lineEnd)
        ? subtractFormatRange(ranges, 'list', lineStart, lineEnd)
        : addFormatRange(ranges, 'list', lineStart, lineEnd),
      selectionStart: selStart,
      selectionEnd: selEnd,
    };
  }

  if (selStart === selEnd) {
    const inserted = FORMAT_PLACEHOLDER[kind];
    const nextText = text.slice(0, selStart) + inserted + text.slice(selEnd);
    const adjusted = adjustRangesForEdit(ranges, text, nextText);
    return {
      text: nextText,
      ranges: addFormatRange(adjusted, kind, selStart, selStart + inserted.length),
      selectionStart: selStart,
      selectionEnd: selStart + inserted.length,
    };
  }

  return {
    text,
    ranges: rangesCover(ranges, kind, selStart, selEnd)
      ? subtractFormatRange(ranges, kind, selStart, selEnd)
      : addFormatRange(ranges, kind, selStart, selEnd),
    selectionStart: selStart,
    selectionEnd: selEnd,
  };
}

/** Line spans of `text` as [start, end) offsets, newline excluded. */
function lineSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let at = 0;
  for (const line of text.split('\n')) {
    spans.push({ start: at, end: at + line.length });
    at += line.length + 1;
  }
  return spans;
}

function isListLine(
  span: { start: number; end: number },
  ranges: InlineFormatRange[],
): boolean {
  return ranges.some((r) => r.kind === 'list' && r.start < span.end && r.end > span.start);
}

/** The plain-text half of a list: each listed line gains an honest "• " bullet. */
function applyListBullets(text: string, ranges: InlineFormatRange[]): string {
  if (!ranges.some((r) => r.kind === 'list')) return text;
  const spans = lineSpans(text);
  return text
    .split('\n')
    .map((line, i) => {
      const span = spans[i];
      if (!span || !isListLine(span, ranges)) return line;
      const trimmed = line.trimStart();
      if (!trimmed || trimmed.startsWith('•')) return line;
      return `• ${trimmed}`;
    })
    .join('\n');
}

function wrapFormattedSegment(escaped: string, kinds: ReadonlySet<InlineFormatKind>): string {
  let out = escaped;
  // Innermost first, so nesting order is deterministic: strong > em > u > s.
  if (kinds.has('strikethrough')) out = `<s>${out}</s>`;
  if (kinds.has('underline')) out = `<u>${out}</u>`;
  if (kinds.has('italic')) out = `<em>${out}</em>`;
  if (kinds.has('bold')) out = `<strong>${out}</strong>`;
  return out;
}

/** Render one slice of body text with the inline ranges that intersect it. */
function renderFormattedSlice(
  slice: string,
  sliceStart: number,
  ranges: InlineFormatRange[],
  wholeKinds: ReadonlySet<InlineFormatKind>,
): string {
  const points = new Set<number>([0, slice.length]);
  for (const r of ranges) {
    if (r.kind === 'list') continue;
    const s = Math.max(0, r.start - sliceStart);
    const e = Math.min(slice.length, r.end - sliceStart);
    if (e > s) {
      points.add(s);
      points.add(e);
    }
  }
  const sorted = [...points].sort((a, b) => a - b);
  let out = '';
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e <= s) continue;
    const kinds = new Set<InlineFormatKind>(wholeKinds);
    for (const r of ranges) {
      if (r.kind === 'list') continue;
      if (r.start - sliceStart <= s && r.end - sliceStart >= e) kinds.add(r.kind);
    }
    out += wrapFormattedSegment(escapeHtml(slice.slice(s, e)).replace(/\n/g, '<br />'), kinds);
  }
  return out;
}

/**
 * The HTML half of a formatted body: paragraphs as <p>, listed lines grouped
 * into <ul><li>, inline ranges as real tags. Falls back to exactly what
 * `plainTextToHtml` produces when there is no formatting at all.
 */
function formattedTextToHtml(
  text: string,
  ranges: InlineFormatRange[],
  wholeKinds: ReadonlySet<InlineFormatKind>,
): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (ranges.length === 0 && wholeKinds.size === 0) return plainTextToHtml(text);

  // Paragraph blocks with their offsets in `text` (blank-line separated).
  const blocks: Array<{ start: number; end: number }> = [];
  const blockRe = /[^\n]+(?:\n(?!\n)[^\n]*)*/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(text)) !== null) {
    if (match[0].trim()) blocks.push({ start: match.index, end: match.index + match[0].length });
  }

  const htmlBlocks = blocks.map((block) => {
    const blockText = text.slice(block.start, block.end);
    const spans = lineSpans(blockText).map((s) => ({
      start: s.start + block.start,
      end: s.end + block.start,
    }));
    const parts: string[] = [];
    let i = 0;
    while (i < spans.length) {
      if (isListLine(spans[i], ranges)) {
        const items: string[] = [];
        while (i < spans.length && isListLine(spans[i], ranges)) {
          const span = spans[i];
          items.push(
            `<li>${renderFormattedSlice(text.slice(span.start, span.end), span.start, ranges, wholeKinds)}</li>`,
          );
          i += 1;
        }
        parts.push(`<ul>${items.join('')}</ul>`);
      } else {
        const groupStart = spans[i].start;
        let groupEnd = spans[i].end;
        i += 1;
        while (i < spans.length && !isListLine(spans[i], ranges)) {
          groupEnd = spans[i].end;
          i += 1;
        }
        parts.push(
          `<p>${renderFormattedSlice(text.slice(groupStart, groupEnd), groupStart, ranges, wholeKinds)}</p>`,
        );
      }
    }
    return parts.join('\n');
  });

  return htmlBlocks.join('\n');
}

/**
 * Validate whole-message presentation into an inline style string.
 * Only hex colours, plain font-family lists, bounded sizes and the three
 * alignments survive — anything else is dropped, never interpolated, so a
 * formatting state can never become a style-injection vector.
 */
function formattingStyle(formatting: MessageFormatting): string {
  const parts: string[] = [];
  if (formatting.color && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(formatting.color)) {
    parts.push(`color:${formatting.color}`);
  }
  if (formatting.fontFamily && /^[\w\s,'".-]+$/.test(formatting.fontFamily)) {
    parts.push(`font-family:${formatting.fontFamily}`);
  }
  if (
    formatting.fontSizePx &&
    Number.isFinite(formatting.fontSizePx) &&
    formatting.fontSizePx >= 8 &&
    formatting.fontSizePx <= 72
  ) {
    parts.push(`font-size:${Math.round(formatting.fontSizePx)}px`);
  }
  if (formatting.textAlign && formatting.textAlign !== 'left') {
    parts.push(`text-align:${formatting.textAlign}`);
  }
  return parts.join(';');
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
export function composeMessageBodies(
  body: string,
  signatureHtml = '',
  formatting?: MessageFormatting,
): ComposedBodies {
  const text = body.trim();
  const signature = signatureHtml.trim();

  // QM-UIUX-081: formatting ranges index the body as the editor held it
  // (untrimmed); shift them into trimmed-text coordinates before rendering.
  const leadTrim = body.length - body.trimStart().length;
  const ranges: InlineFormatRange[] = (formatting?.inline ?? [])
    .map((r) => clampRange({ start: r.start - leadTrim, end: r.end - leadTrim, kind: r.kind }, text.length))
    .filter((r): r is InlineFormatRange => r !== null);
  const wholeKinds = new Set<InlineFormatKind>();
  if (formatting?.bold) wholeKinds.add('bold');
  if (formatting?.italic) wholeKinds.add('italic');
  if (formatting?.underline) wholeKinds.add('underline');
  if (formatting?.strikethrough) wholeKinds.add('strikethrough');
  const style = formatting ? formattingStyle(formatting) : '';
  const listMode = formatting?.list === 'bullet' || formatting?.list === 'numbered' ? formatting.list : undefined;
  const hasFormatting = ranges.length > 0 || wholeKinds.size > 0 || style !== '' || listMode !== undefined;

  let plainBody = hasFormatting ? applyListBullets(text, ranges) : text;
  let htmlBody = hasFormatting ? formattedTextToHtml(text, ranges, wholeKinds) : plainTextToHtml(text);
  if (listMode && ranges.length === 0) {
    // Whole-message list (full composer toolbar): every non-empty line is one
    // item. Inline-range lists (docked composer) keep their own renderer above.
    const items = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (items.length > 0) {
      const tag = listMode === 'numbered' ? 'ol' : 'ul';
      htmlBody = `<${tag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`;
      plainBody = items
        .map((item, idx) => (listMode === 'numbered' ? `${idx + 1}. ${item}` : `• ${item}`))
        .join('\n');
    }
  }
  if (style && htmlBody) {
    htmlBody = `<div style="${style}">${htmlBody}</div>`;
  }

  if (!signature) {
    return { bodyText: plainBody, bodyHtml: htmlBody };
  }

  const signatureText = htmlToPlainText(signature);
  const bodyText = signatureText ? `${plainBody}\n\n${SIGNATURE_DELIMITER}\n${signatureText}` : plainBody;

  // `<hr>` rather than the literal "-- " line: the delimiter is a plain-text
  // convention, and a reader that already draws a rule does not need both.
  const bodyHtml = [htmlBody, '<hr />', signature].filter(Boolean).join('\n');

  return { bodyText, bodyHtml };
}
