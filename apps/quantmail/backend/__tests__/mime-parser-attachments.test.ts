/**
 * Attachment extraction in the MIME parser.
 *
 * The parser used to walk the tree looking only for `text/plain` and `text/html`
 * and drop everything else on the floor, silently — which is why inbound mail
 * arrived with its attachments missing and nothing anywhere said so. These tests
 * pin the two halves of that fix: every non-text part is now described, and no
 * body part is ever mistaken for one.
 */

import { describe, expect, it } from 'vitest';
import { parseRawEmail } from '../lib/mime-parser';

const CRLF = '\r\n';

/** Assemble a raw message from lines, with the CRLF endings real mail uses. */
function raw(...lines: string[]): string {
  return lines.join(CRLF);
}

const PDF_BODY = Buffer.from('%PDF-1.4 not really a pdf').toString('base64');

function multipartMixed(...partBlocks: string[]): string {
  return raw(
    'From: Ada Lovelace <ada@example.com>',
    'To: bob@quantmail.in',
    'Subject: Quarterly numbers',
    'Message-ID: <mixed-1@example.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="BOUND"',
    '',
    'This is a multi-part message in MIME format.',
    ...partBlocks.flatMap((block) => ['--BOUND', block]),
    '--BOUND--',
    '',
  );
}

describe('parseRawEmail — attachments', () => {
  it('describes a base64 attachment beside the body it arrived with', () => {
    const message = multipartMixed(
      raw('Content-Type: text/plain; charset=utf-8', '', 'Numbers attached.', ''),
      raw(
        'Content-Type: application/pdf; name="Q3.pdf"',
        'Content-Disposition: attachment; filename="Q3.pdf"',
        'Content-Transfer-Encoding: base64',
        '',
        PDF_BODY,
        '',
      ),
    );

    const parsed = parseRawEmail(message);

    expect(parsed.bodyPlain.trim()).toBe('Numbers attached.');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]).toMatchObject({
      partIndex: 0,
      filename: 'Q3.pdf',
      mimeType: 'application/pdf',
      isInline: false,
    });
    // Decoded length, not the length on the wire: base64 is ~33% larger, and a size
    // taken from the encoded form would show every file as bigger than it is.
    expect(parsed.attachments[0]?.size).toBe(Buffer.byteLength('%PDF-1.4 not really a pdf'));
  });

  it('marks a cid: part inline so it is not offered as a download', () => {
    const message = multipartMixed(
      raw('Content-Type: text/html; charset=utf-8', '', '<p>See <img src="cid:logo@x"></p>', ''),
      raw(
        'Content-Type: image/png',
        'Content-Disposition: inline; filename="logo.png"',
        'Content-ID: <logo@x>',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from('PNGDATA').toString('base64'),
        '',
      ),
    );

    const parsed = parseRawEmail(message);

    expect(parsed.bodyHtml).toContain('cid:logo@x');
    expect(parsed.attachments[0]).toMatchObject({
      filename: 'logo.png',
      mimeType: 'image/png',
      contentId: 'logo@x',
      isInline: true,
    });
  });

  it('numbers parts depth-first so a later fetch can address one', () => {
    const message = multipartMixed(
      raw(
        'Content-Type: multipart/alternative; boundary="ALT"',
        '',
        '--ALT',
        'Content-Type: text/plain',
        '',
        'plain body',
        '--ALT',
        'Content-Type: text/html',
        '',
        '<p>html body</p>',
        '--ALT--',
        '',
      ),
      raw('Content-Type: text/csv; name="rows.csv"', '', 'a,b,c', ''),
      raw(
        'Content-Type: application/zip',
        'Content-Disposition: attachment; filename="bundle.zip"',
        '',
        'ZIPBYTES',
        '',
      ),
    );

    const parsed = parseRawEmail(message);

    expect(parsed.bodyPlain.trim()).toBe('plain body');
    expect(parsed.bodyHtml.trim()).toBe('<p>html body</p>');
    expect(parsed.attachments.map((a) => [a.partIndex, a.filename])).toEqual([
      [0, 'rows.csv'],
      [1, 'bundle.zip'],
    ]);
  });
});

describe('parseRawEmail — a body part is never mistaken for a file', () => {
  it('keeps a text/plain part that merely carries a name= parameter as the body', () => {
    // Some clients label the body part with `name=`. Treating any named part as an
    // attachment loses the message body *and* produces a phantom file.
    const message = multipartMixed(
      raw(
        'Content-Type: text/plain; charset=utf-8; name="message.txt"',
        '',
        'The actual body.',
        '',
      ),
    );

    const parsed = parseRawEmail(message);

    expect(parsed.bodyPlain.trim()).toBe('The actual body.');
    expect(parsed.attachments).toEqual([]);
  });

  it('treats a text/plain part explicitly dispositioned as an attachment as a file', () => {
    // A .txt someone attached is a file, not the body — and the real body must
    // survive alongside it.
    const message = multipartMixed(
      raw('Content-Type: text/plain; charset=utf-8', '', 'See the attached notes.', ''),
      raw(
        'Content-Type: text/plain; charset=utf-8',
        'Content-Disposition: attachment; filename="notes.txt"',
        '',
        'line one',
        '',
      ),
    );

    const parsed = parseRawEmail(message);

    expect(parsed.bodyPlain.trim()).toBe('See the attached notes.');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]).toMatchObject({ filename: 'notes.txt', mimeType: 'text/plain' });
  });

  it('decodes an RFC 2047 encoded-word filename', () => {
    const encoded = `=?UTF-8?B?${Buffer.from('rapport-annuel.pdf').toString('base64')}?=`;
    const message = multipartMixed(
      raw('Content-Type: text/plain', '', 'body', ''),
      raw(
        'Content-Type: application/pdf',
        `Content-Disposition: attachment; filename="${encoded}"`,
        'Content-Transfer-Encoding: base64',
        '',
        PDF_BODY,
        '',
      ),
    );

    expect(parseRawEmail(message).attachments[0]?.filename).toBe('rapport-annuel.pdf');
  });

  it('names an unnamed part rather than leaving the filename empty', () => {
    const message = multipartMixed(
      raw('Content-Type: text/plain', '', 'body', ''),
      raw(
        'Content-Type: application/octet-stream',
        'Content-Disposition: attachment',
        '',
        'BYTES',
        '',
      ),
    );

    expect(parseRawEmail(message).attachments[0]).toMatchObject({
      filename: 'attachment-1',
      mimeType: 'application/octet-stream',
    });
  });

  it('reports no attachments for a plain single-part message', () => {
    const parsed = parseRawEmail(
      raw('From: a@b.com', 'Subject: hi', 'Content-Type: text/plain', '', 'just text', ''),
    );
    expect(parsed.attachments).toEqual([]);
    expect(parsed.bodyPlain.trim()).toBe('just text');
  });

  it('describes a single-part message that is nothing but a file', () => {
    // No boundary to walk, so the top-level headers *are* the part headers. The
    // walker used to be handed only the Content-Disposition value here, which
    // meant a bare attachment lost its Content-ID and its filename.
    const parsed = parseRawEmail(
      raw(
        'From: a@b.com',
        'Subject: scan',
        'Content-Type: application/pdf; name="scan.pdf"',
        'Content-Disposition: attachment; filename="scan.pdf"',
        'Content-Transfer-Encoding: base64',
        '',
        PDF_BODY,
        '',
      ),
    );

    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]).toMatchObject({
      filename: 'scan.pdf',
      mimeType: 'application/pdf',
      isInline: false,
    });
    expect(parsed.bodyPlain).toBe('');
  });
});

describe('parseRawEmail — headers', () => {
  it('exposes the raw header map, lowercased and unfolded', () => {
    // The ingest pipeline needs these for threading and for recording what the
    // transport said; folding is a wire convention, not part of the value.
    const parsed = parseRawEmail(
      raw(
        'From: "Lovelace, Ada" <ada@example.com>',
        'To: bob@quantmail.in, carol@quantmail.in',
        'Subject: A subject long enough that a real',
        '  client would fold it across two lines',
        'Message-ID: <abc@example.com>',
        'In-Reply-To: <parent@example.com>',
        'References: <root@example.com> <parent@example.com>',
        'X-Custom-Header: kept',
        'Content-Type: text/plain',
        '',
        'body',
        '',
      ),
    );

    expect(parsed.subject).toBe(
      'A subject long enough that a real client would fold it across two lines',
    );
    expect(parsed.messageId).toBe('abc@example.com');
    expect(parsed.inReplyTo).toBe('parent@example.com');
    expect(parsed.references).toBe('<root@example.com> <parent@example.com>');
    expect(parsed.fromAddress).toBe('ada@example.com');
    expect(parsed.fromName).toBe('Lovelace, Ada');
    expect(parsed.toAddresses).toEqual(['bob@quantmail.in', 'carol@quantmail.in']);
    expect(parsed.headers['x-custom-header']).toBe('kept');
  });
});
