/**
 * Lightweight MIME email parser � zero external dependencies.
 * Handles multipart/mixed, multipart/alternative, text/plain, text/html.
 */

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

function extractContent(
  raw: string,
  contentType: string,
  cte: string,
  boundary?: string,
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
      const sub = extractContent(bRaw, pCt, pCte, pBnd);
      if (!plain && sub.plain) plain = sub.plain;
      if (!html && sub.html) html = sub.html;
    }
    return { plain, html };
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
  const { plain, html } = extractContent(body, contentType, cte, boundary);
  let date: Date | undefined;
  try {
    if (headers['date']) date = new Date(headers['date']);
  } catch {
    /* ignore */
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
  };
}
