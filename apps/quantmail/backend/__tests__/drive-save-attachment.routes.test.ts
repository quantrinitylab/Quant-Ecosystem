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

vi.mock('../services/drive-storage.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/drive-storage.service')>();
  return {
    ...actual,
    // Storage is "ready"; the network writes themselves are stubbed out.
    driveStorageReady: () => true,
    putDriveObject: vi.fn(async () => {}),
    deleteDriveObject: vi.fn(async () => {}),
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

function makeAttachmentService(overrides?: {
  bytes?: Buffer;
  infected?: boolean;
  missing?: boolean;
}) {
  return {
    readAttachment: async (attachmentId: string, _userId: string) => {
      if (overrides?.missing || attachmentId !== 'att_known') {
        const err = new Error('Attachment not found') as Error & { statusCode?: number };
        err.statusCode = 404;
        throw err;
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
    attachmentService: (opts?.attachmentService ?? makeAttachmentService()) as never,
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
