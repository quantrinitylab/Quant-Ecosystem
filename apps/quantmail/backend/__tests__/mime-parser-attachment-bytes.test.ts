/**
 * Attachment bytes out of a raw message.
 *
 * `parseRawEmail` describes attachment parts; `extractAttachmentBytes` hands back what the
 * sender actually attached, keyed by the same `partIndex`, so a received file can be kept
 * and opened instead of existing only as a filename. The property these tests pin is
 * exactness: bytes either match what was sent, or the part is reported as unrecoverable
 * (null) — never a plausible-looking corruption.
 */

import { describe, expect, it } from 'vitest';
import { extractAttachmentBytes, parseRawEmail } from '../lib/mime-parser';

const CRLF = '\r\n';

function raw(...lines: string[]): string {
  return lines.join(CRLF);
}

/** base64 wrapped at 76 columns, the way mail clients send it. */
function wrapped(bytes: Buffer): string[] {
  return bytes.toString('base64').match(/.{1,76}/g) ?? [];
}

function message(boundary: string, ...partBlocks: string[]): string {
  return raw(
    'From: Ada Lovelace <ada@example.com>',
    'To: bob@quantmail.in',
    'Subject: Files',
    'Message-ID: <bytes-1@example.com>',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    ...partBlocks.flatMap((block) => [`--${boundary}`, block]),
    `--${boundary}--`,
    '',
  );
}

const BODY = raw('Content-Type: text/plain; charset=utf-8', '', 'See attached.');

describe('extractAttachmentBytes — every byte the sender attached', () => {
  it('decodes a base64 part to exactly the original bytes, all 256 values included', () => {
    const original = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256));
    const mail = message(
      'B',
      BODY,
      raw(
        'Content-Type: application/octet-stream',
        'Content-Disposition: attachment; filename="table.bin"',
        'Content-Transfer-Encoding: base64',
        '',
        ...wrapped(original),
      ),
    );

    const bytes = extractAttachmentBytes(mail);

    expect([...bytes.keys()]).toEqual([0]);
    expect(bytes.get(0)?.equals(original)).toBe(true);
    expect(parseRawEmail(mail).attachments[0]?.size).toBe(original.byteLength);
  });

  it('decodes quoted-printable, soft line breaks and escaped bytes alike', () => {
    const mail = message(
      'B',
      BODY,
      raw(
        'Content-Type: text/csv; charset=utf-8',
        'Content-Disposition: attachment; filename="prices.csv"',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        'item,price',
        'chai,=E2=82=B920 =3D cheap',
        'a very long line that the sender wrapped=',
        ' here',
      ),
    );

    expect(extractAttachmentBytes(mail).get(0)?.toString('utf-8')).toBe(
      'item,price\r\nchai,\u20b920 = cheap\r\na very long line that the sender wrapped here',
    );
  });

  it('keeps an 8bit part that arrived as valid UTF-8', () => {
    const mail = message(
      'B',
      BODY,
      raw(
        'Content-Type: text/plain; charset=utf-8',
        'Content-Disposition: attachment; filename="notes.txt"',
        'Content-Transfer-Encoding: 8bit',
        '',
        'Café — ₹500',
        'second line',
      ),
    );

    expect(extractAttachmentBytes(mail).get(0)).toEqual(
      Buffer.from('Café — ₹500\r\nsecond line', 'utf-8'),
    );
  });

  it('reports an 8bit part whose bytes were lost in decoding as unrecoverable', () => {
    const mail = message(
      'B',
      BODY,
      raw(
        'Content-Type: application/octet-stream',
        'Content-Disposition: attachment; filename="raw.bin"',
        'Content-Transfer-Encoding: binary',
        '',
        // What a UTF-8 decode leaves where invalid bytes used to be.
        'PK\u0003\u0004\uFFFD\uFFFD',
      ),
    );

    const bytes = extractAttachmentBytes(mail);
    expect(bytes.has(0)).toBe(true);
    expect(bytes.get(0)).toBeNull();
  });
});

describe('extractAttachmentBytes — the same numbering as parseRawEmail', () => {
  const pdf = Buffer.from('%PDF-1.7 quarterly');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
  const xlsx = Buffer.from('PK\u0003\u0004 workbook', 'latin1');
  const mail = message(
    'OUTER',
    raw(
      'Content-Type: multipart/related; boundary="INNER"',
      '',
      '--INNER',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Chart: <img src="cid:chart@x"></p>',
      '--INNER',
      'Content-Type: image/png',
      'Content-ID: <chart@x>',
      'Content-Transfer-Encoding: base64',
      '',
      ...wrapped(png),
      '--INNER--',
    ),
    raw(
      'Content-Type: application/pdf; name="Q3.pdf"',
      'Content-Disposition: attachment; filename="Q3.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      ...wrapped(pdf),
    ),
    raw(
      'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition: attachment; filename="Budget.xlsx"',
      'Content-Transfer-Encoding: base64',
      '',
      ...wrapped(xlsx),
    ),
  );

  it('keys nested parts by the partIndex the parsed metadata reports', () => {
    const parts = parseRawEmail(mail).attachments;
    const bytes = extractAttachmentBytes(mail);

    expect(parts.map((part) => [part.partIndex, part.filename, part.isInline])).toEqual([
      [0, 'attachment-1', true],
      [1, 'Q3.pdf', false],
      [2, 'Budget.xlsx', false],
    ]);
    expect(bytes.get(0)?.equals(png)).toBe(true);
    expect(bytes.get(1)?.equals(pdf)).toBe(true);
    expect(bytes.get(2)?.equals(xlsx)).toBe(true);
    for (const part of parts) {
      expect(bytes.get(part.partIndex)?.byteLength).toBe(part.size);
    }
  });

  it('decodes only the parts asked for', () => {
    const bytes = extractAttachmentBytes(mail, [2]);

    expect([...bytes.keys()]).toEqual([2]);
    expect(bytes.get(2)?.equals(xlsx)).toBe(true);
  });

  it('leaves parsing unchanged: body text still comes out of the nested tree', () => {
    const parsed = parseRawEmail(mail);
    expect(parsed.bodyHtml).toContain('cid:chart@x');
    expect(parsed.subject).toBe('Files');
  });
});
