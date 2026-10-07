/**
 * Lightweight MIME email parser — zero external dependencies.
 * Handles multipart/mixed, multipart/alternative, text/plain, text/html.
 */

/**
 * One non-text MIME part, described rather than carried.
 *
 * The bytes are deliberately not held here: an inbound message can be tens of
 * megabytes and the parser runs inside a webhook request. `partIndex` is this
 * part's position among the attachment parts, in depth-first order, so a later
 * download endpoint can re-parse the same raw message and reach exactly this one.
 */
export interface ParsedAttachment {
  partIndex: number;
  filename: string;
  mimeType: string;
  /** Decoded byte length, not the encoded length on the wire. */
  size: number;
  contentId?: string;
  /** True for a part referenced from the HTML body (`cid:`), not a download. */
  isInline: boolean;
}

export interface ParsedEmail {
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  date?: Date;
  /**
   * Every attachment part found in the tree. Previously the parser discarded
   * these silently, so inbound mail arrived with its attachments missing and no
   * indication that anything had been dropped.
   */
  attachments: ParsedAttachment[];
  /** Lowercased header name -> raw value, for authentication and threading. */
  headers: Record<string, string>;
}

function decodeQP(text: string): string {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBase64(text: string): string {
  try {
    return Buffer.from(text.replace(/\s/g, ''), 'base64').toString('utf-8');
  } catch {
    return text;
  }
}

function decodeEncodedWord(text: string): string {
  return text.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_m: string, _cs: string, enc: string, encoded: string) => {
      if (enc.toUpperCase() === 'B') return decodeBase64(encoded);
      return decodeQP(encoded.replace(/_/g, ' '));
    },
  );
}

function parseAddresses(raw: string): Array<{ name?: string; email: string }> {
  const results: Array<{ name?: string; email: string }> = [];
  const parts = raw.split(/,(?![^<]*>)(?![^"]*")/);
  for (const part of parts) {
    const trimmed = decodeEncodedWord(part.trim());
    const angleMatch = trimmed.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
    if (angleMatch) {
      results.push({
        name: angleMatch[1].trim() || undefined,
        email: angleMatch[2].trim().toLowerCase(),
      });
      continue;
    }
    const plainEmail = trimmed.replace(/[<>]/g, '').trim();
    if (plainEmail.includes('@')) results.push({ email: plainEmail.toLowerCase() });
  }
  return results;
}

function splitHeadersBody(raw: string): { headers: string; body: string } {
  const sepIdx = raw.search(/\r?\n\r?\n/);
  if (sepIdx === -1) return { headers: raw, body: '' };
  return { headers: raw.slice(0, sepIdx), body: raw.slice(sepIdx).replace(/^\r?\n\r?\n/, '') };
}

function parseHeaders(raw: string): Record<string, string> {
  const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ');
  const map: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const val = line.slice(colon + 1).trim();
    if (!map[key]) map[key] = val;
  }
  return map;
}

function decodePart(body: string, cte: string): string {
  const enc = (cte || '').toLowerCase().trim();
  if (enc === 'base64') return decodeBase64(body);
  if (enc === 'quoted-printable') return decodeQP(body);
  return body;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Read a `name="value"` parameter out of a structured header value. */
function paramOf(headerValue: string, name: string): string | undefined {
  const match = headerValue.match(
    new RegExp(`${name}\\s*=\\s*"([^"]*)"|${name}\\s*=\\s*([^;\\s]+)`, 'i'),
  );
  const raw = match?.[1] ?? match?.[2];
  return raw ? decodeEncodedWord(raw).trim() : undefined;
}

/**
 * Decoded size of a part, without keeping the decoded bytes around. base64 is
 * measured exactly; anything else is already its own byte length.
 */
function decodedByteLength(body: string, cte: string): number {
  const enc = (cte || '').toLowerCase().trim();
  if (enc === 'base64') {
    const clean = body.replace(/\s/g, '');
    const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  }
  if (enc === 'quoted-printable') {
    return Buffer.byteLength(decodeQP(body), 'utf-8');
  }
  return Buffer.byteLength(body, 'utf-8');
}

/** Accumulator threaded through the MIME walk so nested parts share one list. */
interface WalkContext {
  attachments: ParsedAttachment[];
}

function extractContent(
  raw: string,
  contentType: string,
  cte: string,
  ctx: WalkContext,
  boundary?: string,
  partHeaders?: Record<string, string>,
): { plain: string; html: string } {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('multipart/')) {
    const bnd = boundary ?? ct.match(/boundary="?([^";]+)"?/)?.[1];
    if (!bnd) return { plain: '', html: '' };
    const delimiter = `--${bnd}`;
    const parts = raw.split(new RegExp(`\r?\n?${escapeRegex(delimiter)}(?:--)?`));
    let plain = '';
    let html = '';
    for (const part of parts.slice(1)) {
      if (part.trim() === '' || part.trim() === '--') continue;
      const { headers: hRaw, body: bRaw } = splitHeadersBody(part);
      const hdr = parseHeaders(hRaw);
      const pCt = hdr['content-type'] ?? 'text/plain';
      const pCte = hdr['content-transfer-encoding'] ?? '7bit';
      const pBnd = pCt.match(/boundary="?([^";]+)"?/)?.[1];
      const sub = extractContent(bRaw, pCt, pCte, ctx, pBnd, hdr);
      if (!plain && sub.plain) plain = sub.plain;
      if (!html && sub.html) html = sub.html;
    }
    return { plain, html };
  }

  // Leaf part. Decide whether it is body text or an attachment before decoding:
  // a `text/plain` part with `Content-Disposition: attachment` is a .txt file
  // someone sent, not the message body, and letting it become the body loses
  // both the real body and the file.
  const disposition = partHeaders?.['content-disposition'] ?? '';
  const dispo = disposition.toLowerCase();
  const filename = paramOf(disposition, 'filename') ?? paramOf(contentType, 'name');
  const isTextBody = ct.startsWith('text/html') || ct.startsWith('text/plain');
  const isAttachment = dispo.includes('attachment') || !isTextBody;

  if (isAttachment || (filename && !isTextBody)) {
    const contentId = partHeaders?.['content-id']?.replace(/[<>]/g, '').trim();
    ctx.attachments.push({
      partIndex: ctx.attachments.length,
      filename: filename ?? `attachment-${ctx.attachments.length + 1}`,
      mimeType: ct.split(';')[0]?.trim() || 'application/octet-stream',
      size: decodedByteLength(raw, cte),
      ...(contentId ? { contentId } : {}),
      isInline: dispo.includes('inline') || Boolean(contentId),
    });
    return { plain: '', html: '' };
  }

  const decoded = decodePart(raw, cte);
  if (ct.startsWith('text/html')) return { plain: '', html: decoded };
  if (ct.startsWith('text/plain')) return { plain: decoded, html: '' };
  return { plain: '', html: '' };
}

export function parseRawEmail(raw: string): ParsedEmail {
  const { headers: hRaw, body } = splitHeadersBody(raw);
  const headers = parseHeaders(hRaw);
  const fromRaw = decodeEncodedWord(headers['from'] ?? '');
  const fromParsed = parseAddresses(fromRaw)[0] ?? { email: 'unknown@unknown.invalid' };
  const toParsed = parseAddresses(decodeEncodedWord(headers['to'] ?? ''));
  const ccParsed = parseAddresses(decodeEncodedWord(headers['cc'] ?? ''));
  const subject = decodeEncodedWord(headers['subject'] ?? '(no subject)');
  const messageId = headers['message-id']?.replace(/[<>]/g, '').trim();
  const inReplyTo = headers['in-reply-to']?.replace(/[<>]/g, '').trim();
  const references = headers['references']?.trim();
  const contentType = headers['content-type'] ?? 'text/plain';
  const cte = headers['content-transfer-encoding'] ?? '7bit';
  const boundary = contentType.match(/boundary="?([^";]+)"?/)?.[1];
  const ctx: WalkContext = { attachments: [] };
  const { plain, html } = extractContent(body, contentType, cte, ctx, boundary, headers);
  let date: Date | undefined;
  if (headers['date']) {
    // `new Date(...)` does not throw on an unparseable string, it returns an
    // Invalid Date — which reaches the database as a value Prisma rejects. Check
    // the time value rather than relying on the try/catch that used to be here.
    const parsed = new Date(headers['date']);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  return {
    messageId,
    inReplyTo,
    references,
    fromAddress: fromParsed.email,
    fromName: fromParsed.name,
    toAddresses: toParsed.map((a) => a.email),
    ccAddresses: ccParsed.map((a) => a.email),
    subject,
    bodyPlain: plain,
    bodyHtml: html,
    date,
    attachments: ctx.attachments,
    headers,
  };
}
