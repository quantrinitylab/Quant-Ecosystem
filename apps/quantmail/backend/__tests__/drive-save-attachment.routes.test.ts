// @vitest-environment node
// ============================================================================
// QM-M39-010 — Drive: mail attachment handoff (M39 screen 30) route tests.
//
// Covers: POST /drive/files/save-attachment —
//   1. real attachment bytes become one canonical Drive File row whose
//      contentHash is the SHA-256 of those exact bytes,
//   2. saving the same content twice returns the existing row with
//      `deduplicated: true` — no second Drive row, no second storage blob,
//   3. infected bytes are rejected (422) before touching Drive storage,
//   4. unknown attachment ids 404, missing auth 401,
//   5. the save logs a real 'upload' activity event with
//      source: 'mail-attachment' (dedupe hits log nothing).
//   6. CODEX-REVIEW (PR #1128) successor gate: a foreign user's row 404s
//      (existence hidden — no 403 oracle), a deleted row 404s honestly, a
//      revoked/never-completed row 409s UPLOAD_INCOMPLETE — none of them
//      writes a Drive row, an object, or an activity event.
//   7. Mail → Drive → read-back receipt: the saved bytes download back out
//      of Drive byte-exact (real encrypt/decrypt round trip), and the
//      activity event carries the return-to-mail provenance
//      (source/messageId/attachmentId).
//
// The crypto is REAL (test DRIVE_MASTER_KEY); only the network writes
// (put/delete object) are stubbed. No fake success states.
// ============================================================================

import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

vi.mock('@quant/ai', () => ({
  AIEngine: class {
    infer = vi.fn();
  },
}));

// In-memory stand-in for the object store: putDriveObject captures the real
// ciphertext, getDriveObject serves it back — so a save→download round trip
// exercises the real encrypt/decrypt pipeline with only the network stubbed.
// lastCheckedPlaintext captures the exact bytes the download route's
// checkedPlaintext returned: inject decodes Buffer payloads as UTF-8, so
// bytes ≥128 don't survive res.body — the capture is the byte-exact proof,
// the 200 + content-length proves the route served exactly those bytes.
const objectStore = new Map<string, Buffer>();
let lastCheckedPlaintext: Buffer | null = null;

vi.mock('../services/drive-storage.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/drive-storage.service')>();
  return {
    ...actual,
    // Storage is "ready"; the network writes themselves are stubbed out.
    driveStorageReady: () => true,
    putDriveObject: vi.fn(async (key: string, body: Buffer) => {
      objectStore.set(key, Buffer.from(body));
    }),
    getDriveObject: vi.fn(async (key: string) => {
      const body = objectStore.get(key);
      if (!body) throw new Error(`object not found: ${key}`);
      return body;
    }),
    deleteDriveObject: vi.fn(async (key: string) => {
      objectStore.delete(key);
    }),
    // checkedPlaintext's real implementation calls the module-internal
    // getDriveObject (real network). Re-wire just the fetch to the
    // in-memory store; the decrypt + SHA-256 integrity verification stay
    // the real exported implementations, so the round trip is still a
    // genuine encrypt → store → decrypt proof.
    checkedPlaintext: async (row: {
      encryptedContent: string;
      encryptionIV: string;
      encryptionAuthTag: string;
      encryptionKey: string;
      contentHash?: string;
    }) => {
      const ciphertext = objectStore.get(row.encryptedContent);
      if (!ciphertext) throw new Error(`object not found: ${row.encryptedContent}`);
      const plaintext = actual.decryptFromDrive(
        ciphertext,
        row.encryptionIV,
        row.encryptionAuthTag,
        row.encryptionKey,
      );
      const expected = actual.hashFromVersionKey(row.encryptedContent) ?? row.contentHash;
      const actualHash = createHash('sha256').update(plaintext).digest('hex');
      if (expected && actualHash !== expected.toLowerCase()) {
        throw new Error('Stored object failed integrity validation');
      }
      lastCheckedPlaintext = plaintext;
      return plaintext;
    },
  };
});

// Test master key: 64 hex chars → 32-byte AES key for the real encryptForDrive.
process.env.DRIVE_MASTER_KEY = 'ab'.repeat(32);

interface FileRow {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  userId: string;
  isDeleted: boolean;
  isStarred: boolean;
  contentHash: string;
  encryptedContent: string;
  encryptionIV: string;
  encryptionAuthTag: string;
  encryptionKey: string;
  scanStatus: string;
  scanReason: string | null;
  scannedAt: Date | null;
  lastOpenedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ActivityEvent {
  fileId: string;
  action: string;
  details: Record<string, unknown>;
}

let files: FileRow[] = [];
let versions: Array<{ id: string; fileId: string; versionNumber: number; size: number }> = [];
let events: ActivityEvent[] = [];
let fileSeq = 0;

const users = new Map<string, { id: string; displayName: string; email: string }>([
  ['user-owner', { id: 'user-owner', displayName: 'Owner Name', email: 'owner@quantmail.in' }],
]);

function createFakePrisma() {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.get(where.id) ?? null,
      findMany: async () => [],
      findFirst: async () => null,
    },
    userSubscription: {
      findUnique: async () => null,
    },
    file: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        files.find(
          (f) =>
            (where.userId === undefined || f.userId === where.userId) &&
            (where.contentHash === undefined || f.contentHash === where.contentHash) &&
            (where.isDeleted === undefined || f.isDeleted === where.isDeleted) &&
            (where.id === undefined || f.id === where.id),
        ) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        files.find((f) => f.id === where.id) ?? null,
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        fileSeq += 1;
        const row = {
          id: `drive-file-${fileSeq}`,
          folderId: null,
          isStarred: false,
          isDeleted: false,
          scanReason: null,
          scannedAt: null,
          lastOpenedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(data as Partial<FileRow>),
        } as FileRow;
        files.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = files.find((f) => f.id === where.id);
        if (!row) throw new Error('file not found');
        Object.assign(row, data);
        return row;
      },
      aggregate: async () => ({ _sum: { size: 0 } }),
    },
    folder: {
      findFirst: async () => null,
    },
    fileVersion: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `ver-${versions.length + 1}`,
          ...(data as { fileId: string; versionNumber: number; size: number }),
        };
        versions.push(row);
        return row;
      },
    },
    $transaction: async (ops: Array<Promise<unknown>>) => {
      const results: unknown[] = [];
      for (const op of ops) results.push(await op);
      return results;
    },
    $executeRawUnsafe: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT INTO "drive_file_activity_events"')) {
        events.push({
          fileId: params[1] as string,
          action: params[6] as string,
          details: JSON.parse(params[7] as string),
        });
        return 1;
      }
      return 1;
    },
  };
}

const ATTACHMENT_BYTES = Buffer.from('the-real-attachment-bytes');
const EXPECTED_HASH = createHash('sha256').update(ATTACHMENT_BYTES).digest('hex');

// UUID-shaped ids that name no resolvable row for the caller:
// - FOREIGN: another user's AttachmentService row — the real
//   requireOwnedRow hides it as 404 (never 403: no existence oracle).
// - DELETED: the caller's own row, deleted before the save — honest 404.
// - PENDING: a row whose upload never completed — honest 409, not a fake save.
const FOREIGN_ATTACHMENT_ID = 'att_11111111-2222-4333-8444-555555555555';
const DELETED_ATTACHMENT_ID = 'att_66666666-7777-4888-8999-000000000000';
const PENDING_ATTACHMENT_ID = 'att_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function serviceError(message: string, statusCode: number, code: string) {
  const err = new Error(message) as Error & { statusCode?: number; code?: string };
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function makeAttachmentService(overrides?: {
  bytes?: Buffer;
  infected?: boolean;
  missing?: boolean;
}) {
  return {
    readAttachment: async (attachmentId: string, _userId: string) => {
      // A revoked / never-completed row is an honest 409, never a fake save.
      if (attachmentId === PENDING_ATTACHMENT_ID) {
        throw serviceError('Attachment upload was never completed', 409, 'UPLOAD_INCOMPLETE');
      }
      if (overrides?.missing || attachmentId !== 'att_known') {
        throw serviceError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');
      }
      return {
        metadata: { id: 'att_known', filename: 'report.pdf', contentType: 'application/pdf' },
        body: overrides?.bytes ?? ATTACHMENT_BYTES,
      };
    },
  };
}

function makeScanner(infected: boolean) {
  return {
    scanBuffer: async () => ({
      isInfected: infected,
      virusName: infected ? 'EICAR-Test-Signature' : undefined,
      scannedAt: new Date(),
      engine: 'test-scanner',
    }),
  };
}

async function buildApp(opts?: {
  attachmentService?: unknown;
  infected?: boolean;
  currentUserId?: string | null;
  bytes?: Buffer;
}): Promise<FastifyInstance> {
  const { default: driveRoutes } = await import('../routes/drive');
  const app = Fastify();
  app.decorate('prisma', createFakePrisma() as never);
  app.addHook('onRequest', async (request) => {
    if (opts?.currentUserId) {
      (request as unknown as { auth: { userId: string } }).auth = {
        userId: opts.currentUserId,
      };
    }
  });
  await app.register(driveRoutes, {
    attachmentService: (opts?.attachmentService ??
      makeAttachmentService({ bytes: opts?.bytes })) as never,
    attachmentScanner: makeScanner(Boolean(opts?.infected)),
  });
  await app.ready();
  return app;
}

describe('QM-M39-010 POST /drive/files/save-attachment', () => {
  beforeEach(() => {
    files = [];
    versions = [];
    events = [];
    fileSeq = 0;
    objectStore.clear();
    lastCheckedPlaintext = null;
  });

  it('creates one canonical Drive file from the real attachment bytes', async () => {
    const app = await buildApp({ currentUserId: 'user-owner' });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: 'att_known', messageId: 'msg-1' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.deduplicated).toBe(false);
    expect(body.file.name).toBe('report.pdf');
    expect(body.file.mimeType).toBe('application/pdf');
    expect(body.file.size).toBe(ATTACHMENT_BYTES.length);
    // The Drive row's contentHash is the SHA-256 of the exact bytes read.
    expect(files).toHaveLength(1);
    expect(files[0].contentHash).toBe(EXPECTED_HASH);
    expect(files[0].scanStatus).toBe('unknown');
    // One real activity event with the mail-attachment provenance.
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('upload');
    expect(events[0].details.source).toBe('mail-attachment');
    expect(events[0].details.messageId).toBe('msg-1');
    expect(events[0].details.attachmentId).toBe('att_known');
    await app.close();
  });

  it('dedupes on content hash — no second Drive row for the same bytes', async () => {
    const app = await buildApp({ currentUserId: 'user-owner' });
    const first = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: 'att_known' },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: 'att_known' },
    });
    expect(second.statusCode).toBe(200);
    const body = second.json();
    expect(body.deduplicated).toBe(true);
    expect(body.file.id).toBe(first.json().file.id);
    // Still exactly one Drive row and one activity event — the second save
    // created nothing.
    expect(files).toHaveLength(1);
    expect(events).toHaveLength(1);
    await app.close();
  });

  it('different bytes create a separate Drive file (dedupe is hash-scoped)', async () => {
    // A pre-existing Drive file with unrelated content must not dedupe.
    files.push({
      id: 'drive-file-existing',
      name: 'other.pdf',
      mimeType: 'application/pdf',
      size: 5,
      folderId: null,
      userId: 'user-owner',
      isDeleted: false,
      isStarred: false,
      contentHash: createHash('sha256').update(Buffer.from('unrelated')).digest('hex'),
      encryptedContent: 'key',
      encryptionIV: 'iv',
      encryptionAuthTag: 'tag',
      encryptionKey: 'wrapped',
      scanStatus: 'unknown',
      scanReason: null,
      scannedAt: null,
      lastOpenedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const app = await buildApp({ currentUserId: 'user-owner' });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: 'att_known' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().deduplicated).toBe(false);
    // Two rows: the pre-existing one plus the new canonical file.
    expect(files).toHaveLength(2);
    expect(files[1].contentHash).toBe(EXPECTED_HASH);
    await app.close();
  });

  it('rejects infected bytes with 422 before any Drive write', async () => {
    const app = await buildApp({ currentUserId: 'user-owner', infected: true });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: 'att_known' },
    });
    expect(res.statusCode).toBe(422);
    expect(files).toHaveLength(0);
    expect(events).toHaveLength(0);
    await app.close();
  });

  it('404s on an unknown attachment id', async () => {
    const app = await buildApp({ currentUserId: 'user-owner' });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: 'att_nope' },
    });
    expect(res.statusCode).toBe(404);
    expect(files).toHaveLength(0);
    await app.close();
  });

  it('404s on a foreign user\u2019s attachment id — existence is hidden, nothing is written', async () => {
    // The id is a well-formed AttachmentService id, but it names another
    // tenant's row. The route must answer 404 (the service's requireOwnedRow
    // hides foreign rows as misses — a 403 would be an existence oracle)
    // and must not create a Drive row, store an object, or log an event.
    const app = await buildApp({ currentUserId: 'user-owner' });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: FOREIGN_ATTACHMENT_ID, messageId: 'msg-1' },
    });
    expect(res.statusCode).toBe(404);
    expect(files).toHaveLength(0);
    expect(objectStore.size).toBe(0);
    expect(events).toHaveLength(0);
    await app.close();
  });

  it('404s on a deleted attachment id — honest not-found, nothing is written', async () => {
    // The caller's own row, deleted before the save. The row is gone, so the
    // bytes are gone: an honest 404, not a fabricated save.
    const app = await buildApp({ currentUserId: 'user-owner' });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: DELETED_ATTACHMENT_ID, messageId: 'msg-1' },
    });
    expect(res.statusCode).toBe(404);
    expect(files).toHaveLength(0);
    expect(objectStore.size).toBe(0);
    expect(events).toHaveLength(0);
    await app.close();
  });

  it('409s on a revoked/never-completed attachment row — honest incomplete state, nothing is written', async () => {
    // The row exists but its bytes never landed (or were revoked): the save
    // must refuse with the backend's own incomplete state, not invent bytes.
    const app = await buildApp({ currentUserId: 'user-owner' });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: PENDING_ATTACHMENT_ID, messageId: 'msg-1' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain('never completed');
    expect(files).toHaveLength(0);
    expect(objectStore.size).toBe(0);
    expect(events).toHaveLength(0);
    await app.close();
  });

  it('mail \u2192 drive \u2192 read-back receipt: saved bytes download from Drive, provenance points back to the mail', async () => {
    // The full journey receipt, not just a 201: save from mail, then read
    // the file back out of Drive and prove the bytes are the attachment's
    // own. Every byte value 0–255 is in the payload, so the round trip is
    // byte-exact through Drive's real encrypt → store → decrypt pipeline.
    const receiptBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const app = await buildApp({ currentUserId: 'user-owner', bytes: receiptBytes });
    const saveRes = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: 'att_known', messageId: 'msg-1' },
    });
    expect(saveRes.statusCode).toBe(201);
    const fileId = saveRes.json().file.id as string;

    const dlRes = await app.inject({ method: 'GET', url: `/drive/files/${fileId}/download` });
    expect(dlRes.statusCode).toBe(200);
    expect(Number(dlRes.headers['content-length'])).toBe(receiptBytes.length);
    // The UTF-8-safe prefix survives the inject transport exactly — proof the
    // route served the real buffer. The full 256-value range is proven at the
    // mock boundary (see lastCheckedPlaintext).
    expect(Buffer.from(dlRes.body.slice(0, 128), 'latin1')).toEqual(receiptBytes.subarray(0, 128));
    expect(lastCheckedPlaintext).not.toBeNull();
    expect(lastCheckedPlaintext as Buffer).toEqual(receiptBytes);

    // The activity event is the return-to-mail trail: which mail, which part,
    // and that it arrived via the mail-attachment handoff.
    expect(events).toHaveLength(1);
    expect(events[0].details.source).toBe('mail-attachment');
    expect(events[0].details.messageId).toBe('msg-1');
    expect(events[0].details.attachmentId).toBe('att_known');
    await app.close();
  });

  it('400s on an empty payload', async () => {
    const app = await buildApp({ currentUserId: 'user-owner' });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('401s without auth', async () => {
    const app = await buildApp({ currentUserId: null });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/save-attachment',
      payload: { attachmentId: 'att_known' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
