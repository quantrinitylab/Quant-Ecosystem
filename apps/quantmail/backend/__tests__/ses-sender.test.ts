// QM-SCREEN-006 R2 — external recipients must actually receive attachments.
// Proves (with a mocked SES client) that:
//   1. attachments switch sendViaSes to a Raw MIME envelope containing the
//      file payload, filename and correct headers (To/Cc visible, Bcc never
//      in the headers, Reply-To + config set + envelope preserved);
//   2. the no-attachment path keeps the exact original `Simple` behaviour;
//   3. oversized raw messages fail LOUD (413) before any SES transmit;
//   4. resolveOutboundAttachments resolves composer data-URL entries and
//      drive entries, and fails closed on unresolvable ones.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const capturedInputs: any[] = [];
let sendCalls = 0;

vi.mock('@aws-sdk/client-sesv2', () => {
  class SESv2Client {
    constructor(_opts: unknown) {}
    send = vi.fn(async (command: { input: unknown }) => {
      sendCalls += 1;
      capturedInputs.push(command.input);
      return { MessageId: 'ses-msg-1' };
    });
  }
  class SendEmailCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return { SESv2Client, SendEmailCommand };
});

vi.mock('../services/drive-storage.service', () => ({
  checkedPlaintext: vi.fn(async () => Buffer.from('drive-file-bytes')),
  driveStorageReady: () => true,
}));

import {
  sendViaSes,
  buildRawMimeMessage,
  buildMultipartBody,
  sanitizeMimeFilename,
  SES_RAW_MESSAGE_LIMIT_BYTES,
} from '../lib/ses-sender';
import { resolveOutboundAttachments } from '../lib/outbound-attachments';

beforeEach(() => {
  capturedInputs.length = 0;
  sendCalls = 0;
  vi.clearAllMocks();
});

const BASE_OPTS = {
  from: 'Sahenoor <sahenoor@quantmail.in>',
  to: ['friend@gmail.com'],
  cc: ['boss@outlook.com'],
  bcc: ['secret@yahoo.com'],
  subject: 'Q3 report',
  bodyText: 'See attached.',
  bodyHtml: '<p>See attached.</p>',
  replyTo: 'sahenoor@quantmail.in',
};

function pdfAttachment() {
  return {
    filename: 'report.pdf',
    contentType: 'application/pdf',
    content: Buffer.from('%PDF-1.4 fake-bytes', 'utf8'),
  };
}

function rawOf(input: any): string {
  return Buffer.from(input.Content.Raw.Data as Uint8Array).toString('utf8');
}

describe('sendViaSes with attachments (Raw MIME envelope)', () => {
  it('sends a multipart/mixed Raw message containing the attachment payload + filename', async () => {
    const messageId = await sendViaSes({ ...BASE_OPTS, attachments: [pdfAttachment()] });
    expect(messageId).toBe('ses-msg-1');
    expect(sendCalls).toBe(1);
    const input = capturedInputs[0];

    expect(input.Content.Raw).toBeDefined();
    expect(input.Content.Simple).toBeUndefined();

    const raw = rawOf(input);
    expect(raw).toContain('Content-Type: multipart/mixed; boundary="');
    expect(raw).toContain('Content-Type: multipart/alternative;');
    expect(raw).toContain('filename="report.pdf"');
    expect(raw).toContain('Content-Type: application/pdf; name="report.pdf"');
    // The exact payload survives base64 round-trip.
    expect(raw).toContain(Buffer.from('%PDF-1.4 fake-bytes', 'utf8').toString('base64'));

    // Body variants still present inside the envelope.
    expect(raw).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(raw).toContain('Content-Type: text/html; charset=UTF-8');
    expect(raw).toContain(Buffer.from('See attached.', 'utf8').toString('base64'));

    // Header semantics.
    expect(raw).toMatch(/^From: .*sahenoor@quantmail\.in.*$/m);
    expect(raw).toMatch(/^To: friend@gmail\.com$/m);
    expect(raw).toMatch(/^Cc: boss@outlook\.com$/m);
    expect(raw).toMatch(/^Subject: Q3 report$/m);
    expect(raw).toMatch(/^Reply-To: sahenoor@quantmail\.in$/m);
    // MAIL-03: Bcc must NEVER appear in the MIME headers.
    expect(raw).not.toMatch(/^Bcc:/im);
  });

  it('keeps the config set, envelope recipients (incl. Bcc) and ReplyToAddresses intact', async () => {
    await sendViaSes({ ...BASE_OPTS, attachments: [pdfAttachment()] });
    const input = capturedInputs[0];
    expect(input.ConfigurationSetName).toBe('quantmail-sending');
    expect(input.FromEmailAddress).toBe('Sahenoor <sahenoor@quantmail.in>');
    expect(input.Destination.ToAddresses).toEqual(['friend@gmail.com']);
    expect(input.Destination.CcAddresses).toEqual(['boss@outlook.com']);
    expect(input.Destination.BccAddresses).toEqual(['secret@yahoo.com']);
    expect(input.ReplyToAddresses).toEqual(['sahenoor@quantmail.in']);
  });

  it('handles a Bcc-only external send: empty To headers, Bcc still on the envelope', async () => {
    await sendViaSes({
      from: 'sahenoor@quantmail.in',
      to: [],
      bcc: ['secret@yahoo.com'],
      subject: 'hi',
      attachments: [pdfAttachment()],
    });
    const input = capturedInputs[0];
    const raw = rawOf(input);
    expect(raw).toMatch(/^To: *$/m);
    expect(raw).not.toMatch(/^Bcc:/im);
    expect(input.Destination.BccAddresses).toEqual(['secret@yahoo.com']);
  });
});

describe('sendViaSes without attachments (Simple path unchanged)', () => {
  it('keeps the original Simple content shape when no attachments are given', async () => {
    await sendViaSes(BASE_OPTS);
    const input = capturedInputs[0];
    expect(input.Content.Simple).toBeDefined();
    expect(input.Content.Raw).toBeUndefined();
    expect(input.Content.Simple.Subject).toEqual({ Data: 'Q3 report', Charset: 'UTF-8' });
    expect(input.Content.Simple.Body.Html.Data).toBe('<p>See attached.</p>');
    expect(input.Content.Simple.Body.Text.Data).toBe('See attached.');
  });

  it('treats an empty attachments array exactly like no attachments', async () => {
    await sendViaSes({ ...BASE_OPTS, attachments: [] });
    expect(capturedInputs[0].Content.Simple).toBeDefined();
  });
});

describe('SES 10 MB raw-message guard', () => {
  it('fails LOUD with ATTACHMENT_PAYLOAD_TOO_LARGE before any SES transmit', async () => {
    const huge = {
      filename: 'huge.bin',
      contentType: 'application/octet-stream',
      content: Buffer.alloc(SES_RAW_MESSAGE_LIMIT_BYTES + 1, 0x41),
    };
    await expect(sendViaSes({ ...BASE_OPTS, attachments: [huge] })).rejects.toMatchObject({
      code: 'ATTACHMENT_PAYLOAD_TOO_LARGE',
      statusCode: 413,
    });
    expect(sendCalls).toBe(0);
  });
});

describe('buildRawMimeMessage encoding edge cases', () => {
  it('RFC 2047-encodes a non-ASCII subject', () => {
    const buf = buildRawMimeMessage({
      from: 'sahenoor@quantmail.in',
      to: ['a@b.com'],
      subject: 'रिपोर्ट — Q3 ✓',
      attachments: [pdfAttachment()],
    });
    const raw = buf.toString('utf8');
    expect(raw).toContain('Subject: =?UTF-8?B?');
    expect(raw).not.toContain('रिपोर्ट');
  });

  it('RFC 2231-encodes a non-ASCII filename', () => {
    const buf = buildRawMimeMessage({
      from: 'sahenoor@quantmail.in',
      to: ['a@b.com'],
      subject: 'hi',
      attachments: [
        {
          filename: 'रिपोर्ट.pdf',
          contentType: 'application/pdf',
          content: Buffer.from('x'),
        },
      ],
    });
    const raw = buf.toString('utf8');
    expect(raw).toContain("filename*=UTF-8''");
    expect(raw).not.toContain('रिपोर्ट.pdf');
  });

  it('strips header-injection attempts from filenames', () => {
    expect(sanitizeMimeFilename('evil\r\nBcc: x@y.com')).not.toContain('\r\n');
    expect(sanitizeMimeFilename('../../etc/passwd')).not.toContain('..');
  });

  it('emits Message-ID and Date headers when provided', () => {
    const buf = buildRawMimeMessage({
      from: 'sahenoor@quantmail.in',
      to: ['a@b.com'],
      subject: 'hi',
      messageId: '<abc@quantmail.in>',
      date: new Date('2026-10-11T10:00:00Z'),
      attachments: [pdfAttachment()],
    });
    const raw = buf.toString('utf8');
    expect(raw).toContain('Message-ID: <abc@quantmail.in>');
    expect(raw).toContain('Date: Sun, 11 Oct 2026');
  });

  it('buildMultipartBody is usable standalone for the DKIM-signed SMTP fallback', () => {
    const mime = buildMultipartBody({
      bodyText: 'hello',
      attachments: [pdfAttachment()],
    });
    expect(mime.contentTypeHeader).toMatch(/^multipart\/mixed; boundary="/);
    expect(mime.body).toContain('filename="report.pdf"');
    expect(mime.body).toContain(Buffer.from('hello', 'utf8').toString('base64'));
  });
});

describe('resolveOutboundAttachments', () => {
  it('returns [] for missing/empty attachments', async () => {
    await expect(resolveOutboundAttachments(undefined, 'u1')).resolves.toEqual([]);
    await expect(resolveOutboundAttachments([], 'u1')).resolves.toEqual([]);
    await expect(resolveOutboundAttachments(null, 'u1')).resolves.toEqual([]);
  });

  it('resolves a composer data-URL entry to real bytes', async () => {
    const payload = Buffer.from('hello-file', 'utf8').toString('base64');
    const resolved = await resolveOutboundAttachments(
      [
        {
          id: 'att_1234_abcd',
          name: 'notes.txt',
          filename: 'notes.txt',
          size: 10,
          type: 'text/plain',
          mimeType: 'text/plain',
          url: `data:text/plain;base64,${payload}`,
        },
      ],
      'user_1',
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].filename).toBe('notes.txt');
    expect(resolved[0].contentType).toBe('text/plain');
    expect(resolved[0].content.toString('utf8')).toBe('hello-file');
  });

  it('fails closed on a non-base64 data URL instead of sending without the file', async () => {
    await expect(
      resolveOutboundAttachments(
        [{ filename: 'x.txt', url: 'data:text/plain,hello' }],
        'user_1',
      ),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_UNRESOLVABLE' });
  });

  it('fails closed when an entry has no content reference at all', async () => {
    await expect(
      resolveOutboundAttachments([{ filename: 'ghost.pdf', size: 10 }], 'user_1'),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_UNRESOLVABLE' });
  });

  it('resolves a Drive attachment through the drive storage row', async () => {
    const db = {
      file: {
        findFirst: vi.fn(async () => ({
          id: 'file_9',
          userId: 'user_1',
          encryptedContent: 'drive/user_1/file_9',
          encryptionIV: 'iv',
          encryptionAuthTag: 'tag',
          encryptionKey: 'key',
        })),
      },
    };
    const resolved = await resolveOutboundAttachments(
      [
        {
          id: 'drive_file_9_1720000000',
          name: 'deck.pdf',
          filename: 'deck.pdf',
          mimeType: 'application/pdf',
          url: '/api/drive/files/file_9/download',
        },
      ],
      'user_1',
      db,
    );
    expect(db.file.findFirst).toHaveBeenCalledWith({
      where: { id: 'file_9', userId: 'user_1' },
    });
    expect(resolved[0].content.toString('utf8')).toBe('drive-file-bytes');
    expect(resolved[0].filename).toBe('deck.pdf');
  });

  it('fails closed when the Drive file row is missing (never silently dropped)', async () => {
    const db = { file: { findFirst: vi.fn(async () => null) } };
    await expect(
      resolveOutboundAttachments(
        [{ id: 'drive_gone_1', filename: 'gone.pdf', url: '/api/drive/files/gone/download' }],
        'user_1',
        db,
      ),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_UNRESOLVABLE' });
  });
});
