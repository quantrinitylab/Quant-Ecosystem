/**
 * Recipients of internal mail get their own copy of the sender's QuantDrive picks.
 *
 * A Drive pick is a reference (`/api/drive/files/<id>/download`) that Drive serves only to
 * the file's owner. Internal delivery used to hand that reference to every recipient, so the
 * attachment could never open for anyone but the sender. These tests run the copier over the
 * real AttachmentService (fake storage + rows), so "copied" means readable back by the
 * recipient, byte for byte, through the download path.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const drive = vi.hoisted(() => ({
  plaintext: vi.fn(async (_row: unknown) => Buffer.from('%PDF-1.7 from drive')),
}));
vi.mock('../services/drive-storage.service', () => ({
  checkedPlaintext: drive.plaintext,
}));

import { AttachmentService } from '../services/attachment.service';
import {
  RecipientAttachmentCopier,
  type CopierLog,
} from '../services/internal-attachments.service';
import { FakeStorage, makeDb } from './helpers/attachment-doubles';

const SENDER = 'u-ada';
const BOB = 'u-bob';
const CAROL = 'u-carol';

const DRIVE_PICK = {
  id: 'drive_f1_1760000000000',
  name: 'Q3.pdf',
  filename: 'Q3.pdf',
  size: 19,
  type: 'application/pdf',
  mimeType: 'application/pdf',
  url: '/api/drive/files/f1/download',
};
const INLINE = {
  id: 'att_1760000000000_k3j4h5',
  filename: 'note.txt',
  mimeType: 'text/plain',
  size: 2,
  url: 'data:text/plain;base64,aGk=',
};

function driveDb(owner = SENDER) {
  return {
    file: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        where.id === 'f1' && where.userId === owner
          ? {
              id: 'f1',
              userId: owner,
              encryptedContent: 'drive/u-ada/f1',
              encryptionIV: 'iv',
              encryptionAuthTag: 'tag',
              encryptionKey: 'key',
              contentHash: null,
            }
          : null,
      ),
    },
  };
}

let storage: FakeStorage;
let rows: ReturnType<typeof makeDb>;
let attachments: AttachmentService;
let log: { warn: Mock<CopierLog['warn']> };

beforeEach(() => {
  storage = new FakeStorage();
  rows = makeDb();
  attachments = new AttachmentService({ storage: storage as never, db: rows as never });
  log = { warn: vi.fn<CopierLog['warn']>() };
  drive.plaintext.mockClear();
});

function copier(db = driveDb(), entries: unknown[] = [DRIVE_PICK, INLINE], ready = true) {
  return new RecipientAttachmentCopier({
    attachments: entries,
    senderUserId: SENDER,
    db: db as never,
    store: attachments,
    storageReady: () => ready,
    log,
  });
}

describe('RecipientAttachmentCopier', () => {
  it('replaces a Drive pick with the recipient’s own readable copy and keeps inline files', async () => {
    const entries = await copier().forRecipient(BOB);

    const copy = entries[0] as Record<string, unknown>;
    expect(copy['id']).toMatch(/^att_[0-9a-f-]{36}$/);
    expect(copy).toMatchObject({ filename: 'Q3.pdf', mimeType: 'application/pdf', size: 19 });
    expect(copy['url']).toBeUndefined();
    expect(entries[1]).toBe(INLINE);

    const read = await attachments.readAttachment(copy['id'] as string, BOB);
    expect(read.body.toString()).toBe('%PDF-1.7 from drive');
    // Bob's copy is Bob's: the sender and other users cannot reach it by id.
    await expect(attachments.readAttachment(copy['id'] as string, SENDER)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('reads the sender’s file once, however many recipients there are', async () => {
    const db = driveDb();
    const shared = copier(db);

    const forBob = await shared.forRecipient(BOB);
    const forCarol = await shared.forRecipient(CAROL);

    expect(db.file.findFirst).toHaveBeenCalledTimes(1);
    expect(drive.plaintext).toHaveBeenCalledTimes(1);
    const bobId = (forBob[0] as { id: string }).id;
    const carolId = (forCarol[0] as { id: string }).id;
    expect(bobId).not.toBe(carolId);
    expect((await attachments.readAttachment(carolId, CAROL)).body.toString()).toBe(
      '%PDF-1.7 from drive',
    );
  });

  it('leaves the sender’s own copy alone: they own the Drive file', async () => {
    const db = driveDb();

    const entries = await copier(db).forRecipient(SENDER);

    expect(entries).toEqual([DRIVE_PICK, INLINE]);
    expect(db.file.findFirst).not.toHaveBeenCalled();
    expect(storage.uploads).toHaveLength(0);
  });

  it('only reads a Drive file the sender owns', async () => {
    const entries = await copier(driveDb('u-mallory')).forRecipient(BOB);

    expect(entries[0]).toBe(DRIVE_PICK);
    expect(storage.uploads).toHaveLength(0);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ index: 0 }),
      expect.stringContaining('could not be read as the sender'),
    );
  });

  it('keeps the reference when the copy cannot be stored, and still delivers', async () => {
    vi.spyOn(storage, 'upload').mockRejectedValueOnce(new Error('R2 503'));

    const entries = await copier().forRecipient(BOB);

    expect(entries[0]).toBe(DRIVE_PICK);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: BOB, index: 0 }),
      expect.stringContaining('not copied'),
    );
  });

  it('does nothing without object storage, and without Drive picks', async () => {
    expect(await copier(driveDb(), [DRIVE_PICK], false).forRecipient(BOB)).toEqual([DRIVE_PICK]);
    expect(await copier(driveDb(), [INLINE]).forRecipient(BOB)).toEqual([INLINE]);
    expect(await copier(driveDb(), null as never).forRecipient(BOB)).toEqual([]);
    expect(storage.uploads).toHaveLength(0);
  });
});
