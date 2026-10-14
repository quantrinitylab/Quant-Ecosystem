/**
 * Keeping a received message's attachment bytes.
 *
 * Before this, an inbound email carried attachment *descriptions* only — the bytes stayed
 * in the raw message in the SES bucket — so opening, previewing or saving a received file
 * could only fail. The keeper copies each downloadable part into attachment storage as the
 * recipient's own attachment and links its id onto the email. These tests run it over the
 * real AttachmentService (fake storage + rows) so "stored" means readable back, byte for
 * byte, through the same path the download route uses.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { parseRawEmail } from '../lib/mime-parser';
import { AttachmentService } from '../services/attachment.service';
import { InboundAttachmentKeeper, type KeeperLog } from '../services/inbound-attachments.service';
import { FakeStorage, makeDb } from './helpers/attachment-doubles';

const CRLF = '\r\n';
const USER = 'u-bob';
const EMAIL_ID = 'email-1';

const PDF = Buffer.from('%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3 binary tail \u0000\u00ff', 'latin1');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DOCX = Buffer.from('PK\u0003\u0004word/document.xml', 'latin1');

function b64(bytes: Buffer): string[] {
  return bytes.toString('base64').match(/.{1,76}/g) ?? [];
}

const RAW = [
  'From: Ada Lovelace <ada@example.com>',
  'To: bob@quantmail.in',
  'Subject: Q3',
  'Message-ID: <keep-1@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="B"',
  '',
  '--B',
  'Content-Type: multipart/related; boundary="R"',
  '',
  '--R',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Numbers <img src="cid:logo@x"></p>',
  '--R',
  'Content-Type: image/png',
  'Content-ID: <logo@x>',
  'Content-Transfer-Encoding: base64',
  '',
  ...b64(PNG),
  '--R--',
  '--B',
  'Content-Type: application/pdf; name="Q3.pdf"',
  'Content-Disposition: attachment; filename="Q3.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  ...b64(PDF),
  '--B',
  'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'Content-Disposition: attachment; filename="Plan.docx"',
  'Content-Transfer-Encoding: base64',
  '',
  ...b64(DOCX),
  '--B--',
  '',
].join(CRLF);

const PARTS = parseRawEmail(RAW).attachments;

type EmailRow = { id: string; userId: string; attachments: unknown[]; version: number };

function makeEmailDb(row: EmailRow) {
  const state = { row: structuredClone(row) };
  return {
    state,
    email: {
      findUnique: vi.fn(async (args: unknown) => {
        const { where } = args as { where: { id: string } };
        if (where.id !== state.row.id) return null;
        return {
          userId: state.row.userId,
          attachments: structuredClone(state.row.attachments),
          version: state.row.version,
        };
      }),
      updateMany: vi.fn(async (args: unknown) => {
        const { where, data } = args as {
          where: { id: string; userId: string; version: number };
          data: { attachments: unknown[] };
        };
        const { row: current } = state;
        if (
          where.id !== current.id ||
          where.userId !== current.userId ||
          where.version !== current.version
        ) {
          return { count: 0 };
        }
        current.attachments = structuredClone(data.attachments);
        current.version += 1;
        return { count: 1 };
      }),
    },
  };
}

/** What ingest stores on the email: the parser's own attachment list, as JSON. */
function deliveredEmail(overrides: Partial<EmailRow> = {}): EmailRow {
  return {
    id: EMAIL_ID,
    userId: USER,
    attachments: JSON.parse(JSON.stringify(PARTS)),
    version: 0,
    ...overrides,
  };
}

const ARGS = { userId: USER, emailId: EMAIL_ID, rawEmail: RAW, parts: PARTS };

let storage: FakeStorage;
let rows: ReturnType<typeof makeDb>;
let attachments: AttachmentService;
let log: { info: Mock<KeeperLog['info']>; warn: Mock<KeeperLog['warn']> };

beforeEach(() => {
  storage = new FakeStorage();
  rows = makeDb();
  attachments = new AttachmentService({ storage: storage as never, db: rows as never });
  log = { info: vi.fn<KeeperLog['info']>(), warn: vi.fn<KeeperLog['warn']>() };
});

function keeperOver(emailDb: ReturnType<typeof makeEmailDb>, storageReady = true) {
  return new InboundAttachmentKeeper({
    db: emailDb as never,
    store: attachments,
    storageReady: () => storageReady,
  });
}

function entry(emailDb: ReturnType<typeof makeEmailDb>, filename: string) {
  return emailDb.state.row.attachments.find(
    (item) => (item as { filename?: string }).filename === filename,
  ) as Record<string, unknown> | undefined;
}

describe('InboundAttachmentKeeper — received files become openable', () => {
  it('stores each downloadable part as the recipient’s attachment and links its id', async () => {
    const emailDb = makeEmailDb(deliveredEmail());

    const result = await keeperOver(emailDb).keep(ARGS, log);

    expect(result).toEqual({ stored: 2, failed: 0 });
    const pdf = entry(emailDb, 'Q3.pdf')!;
    const docx = entry(emailDb, 'Plan.docx')!;
    expect(pdf['id']).toMatch(/^att_[0-9a-f-]{36}$/);
    expect(docx['id']).toMatch(/^att_[0-9a-f-]{36}$/);
    // The rest of the entry is what it was; only the id is new.
    expect(pdf).toMatchObject({ partIndex: 1, mimeType: 'application/pdf', isInline: false });
    expect(emailDb.state.row.version).toBe(1);

    // Readable back through the download path, byte for byte, by the recipient only.
    const read = await attachments.readAttachment(pdf['id'] as string, USER);
    expect(read.body.equals(PDF)).toBe(true);
    expect(read.metadata).toMatchObject({ emailId: EMAIL_ID, status: 'READY' });
    const word = await attachments.readAttachment(docx['id'] as string, USER);
    expect(word.body.equals(DOCX)).toBe(true);
    await expect(
      attachments.readAttachment(pdf['id'] as string, 'u-mallory'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('leaves a cid: image that belongs to the body alone', async () => {
    const emailDb = makeEmailDb(deliveredEmail());

    await keeperOver(emailDb).keep(ARGS, log);

    const inline = emailDb.state.row.attachments[0] as Record<string, unknown>;
    expect(inline['isInline']).toBe(true);
    expect(inline['id']).toBeUndefined();
    expect(storage.uploads.map((upload) => upload.contentType)).toEqual([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
  });

  it('is idempotent: a redelivered notification stores nothing twice', async () => {
    const emailDb = makeEmailDb(deliveredEmail());
    const keeper = keeperOver(emailDb);

    await keeper.keep(ARGS, log);
    const firstIds = emailDb.state.row.attachments.map((item) => (item as { id?: string }).id);
    const again = await keeper.keep(ARGS, log);

    expect(again).toEqual({ stored: 0, failed: 0 });
    expect(storage.uploads).toHaveLength(2);
    expect(emailDb.state.row.attachments.map((item) => (item as { id?: string }).id)).toEqual(
      firstIds,
    );
  });
});

describe('InboundAttachmentKeeper — never at the mail’s expense', () => {
  it('does nothing, and says so, when object storage is not configured', async () => {
    const emailDb = makeEmailDb(deliveredEmail());

    const result = await keeperOver(emailDb, false).keep(ARGS, log);

    expect(result).toEqual({ stored: 0, failed: 0 });
    expect(emailDb.email.findUnique).not.toHaveBeenCalled();
    expect(storage.uploads).toHaveLength(0);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ emailId: EMAIL_ID }),
      expect.stringContaining('not configured'),
    );
  });

  it('keeps the parts it can when one cannot be stored', async () => {
    const emailDb = makeEmailDb(deliveredEmail());
    const upload = storage.upload.bind(storage);
    vi.spyOn(storage, 'upload')
      .mockImplementationOnce(async () => {
        throw new Error('R2 503');
      })
      .mockImplementation(upload);

    const result = await keeperOver(emailDb).keep(ARGS, log);

    expect(result).toEqual({ stored: 1, failed: 1 });
    expect(entry(emailDb, 'Q3.pdf')!['id']).toBeUndefined();
    expect(entry(emailDb, 'Plan.docx')!['id']).toMatch(/^att_/);
  });

  it('does not fill an entry from a different message that reused the index', async () => {
    const renamed = deliveredEmail();
    (renamed.attachments[1] as Record<string, unknown>)['filename'] = 'Other.pdf';
    const emailDb = makeEmailDb(renamed);

    const result = await keeperOver(emailDb).keep(ARGS, log);

    expect(result.stored).toBe(1);
    expect(entry(emailDb, 'Other.pdf')!['id']).toBeUndefined();
    expect(entry(emailDb, 'Plan.docx')!['id']).toMatch(/^att_/);
  });

  it('never touches another user’s email', async () => {
    const emailDb = makeEmailDb(deliveredEmail({ userId: 'u-someone-else' }));

    const result = await keeperOver(emailDb).keep(ARGS, log);

    expect(result).toEqual({ stored: 0, failed: 0 });
    expect(storage.uploads).toHaveLength(0);
    expect(emailDb.email.updateMany).not.toHaveBeenCalled();
  });
});

describe('InboundAttachmentKeeper — racing writes', () => {
  it('re-reads and retries once when another write bumped the version', async () => {
    const emailDb = makeEmailDb(deliveredEmail());
    // A filter labels the email while the bytes upload.
    const upload = storage.upload.bind(storage);
    vi.spyOn(storage, 'upload').mockImplementation(async (...args) => {
      emailDb.state.row.version = 7;
      return upload(...args);
    });

    const result = await keeperOver(emailDb).keep(ARGS, log);

    expect(result.stored).toBe(2);
    expect(emailDb.email.updateMany).toHaveBeenCalledTimes(2);
    expect(emailDb.state.row.version).toBe(8);
    expect(entry(emailDb, 'Q3.pdf')!['id']).toMatch(/^att_/);
  });

  it('removes its own copies when a concurrent delivery linked the parts first', async () => {
    const emailDb = makeEmailDb(deliveredEmail());
    const winner = {
      1: 'att_11111111-1111-4111-8111-111111111111',
      2: 'att_22222222-2222-4222-8222-222222222222',
    } as Record<number, string>;
    const upload = storage.upload.bind(storage);
    vi.spyOn(storage, 'upload').mockImplementation(async (...args) => {
      emailDb.state.row.attachments = emailDb.state.row.attachments.map((item) => {
        const index = (item as { partIndex: number }).partIndex;
        return winner[index] ? { ...(item as object), id: winner[index] } : item;
      });
      emailDb.state.row.version += 1;
      return upload(...args);
    });

    const result = await keeperOver(emailDb).keep(ARGS, log);

    expect(result.stored).toBe(0);
    expect(entry(emailDb, 'Q3.pdf')!['id']).toBe(winner[1]);
    // Both of this run's objects and rows are gone again.
    expect(storage.objects.size).toBe(0);
    expect(rows.rows.size).toBe(0);
  });
});
