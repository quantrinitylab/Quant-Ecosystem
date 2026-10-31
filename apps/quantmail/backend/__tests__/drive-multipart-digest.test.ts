// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  digestMultipartFile,
  resumePendingMultipartDigests,
} from '../services/multipart-upload-session.service';

describe('CODEX PR #1558: background multipart digest (pending/ready/failed)', () => {
  let sessions: any[] = [];
  let files: any[] = [];

  function matchWhere(row: any, where: any): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (value !== null && typeof value === 'object' && 'in' in (value as any)) {
        if (!(value as any).in.includes(row[key])) return false;
      } else if (row[key] !== value) {
        return false;
      }
    }
    return true;
  }

  function fakePrisma() {
    return {
      multipartUploadSession: {
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          return sessions.find((s) => s.uploadId === where.uploadId) ?? null;
        }),
        findMany: vi.fn().mockImplementation(async ({ where, take }: any) => {
          const found = sessions.filter((s) => matchWhere(s, where));
          return typeof take === 'number' ? found.slice(0, take) : found;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const row = sessions.find((s) => s.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
          let count = 0;
          for (const row of sessions) {
            if (matchWhere(row, where)) {
              Object.assign(row, data);
              count += 1;
            }
          }
          return { count };
        }),
      },
      file: {
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const row = files.find((f) => f.id === where.id);
          if (row) Object.assign(row, data);
          return row ?? null;
        }),
      },
    };
  }

  function completedSession(overrides: any = {}) {
    return {
      id: 'session-1',
      uploadId: 'upload-mp-123',
      userId: 'user-1',
      storageKey: 'drive/user-1/multipart/test-large.zip',
      name: 'test-large.zip',
      mimeType: 'application/zip',
      totalSize: 15,
      folderId: null,
      status: 'completed',
      hashStatus: 'pending',
      contentHash: null,
      fileId: 'file-1',
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    sessions = [];
    files = [{ id: 'file-1', contentHash: '' }];
  });

  it('digest success streams the object and stores the real SHA-256 (never the ETag)', async () => {
    const prisma: any = fakePrisma();
    const session = completedSession();
    sessions.push(session);
    const bytes = Buffer.from('identical-bytes'); // 14 bytes
    const storage = {
      download: vi.fn().mockResolvedValue({
        body: Readable.from([bytes]),
        contentLength: bytes.length,
      }),
    };
    const result = await digestMultipartFile(prisma, storage, session);
    expect(result.contentHash).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(result.bytesHashed).toBe(15);
    expect(files[0].contentHash).toBe(result.contentHash);
    expect(session.hashStatus).toBe('ready');
    expect(session.contentHash).toBe(result.contentHash);
  });

  it('digest failure marks hashStatus failed and never stores a wrong hash', async () => {
    const prisma: any = fakePrisma();
    const session = completedSession();
    sessions.push(session);
    const storage = {
      download: vi.fn().mockRejectedValue(new Error('storage unavailable')),
    };
    await expect(digestMultipartFile(prisma, storage, session)).rejects.toThrow(
      'storage unavailable',
    );
    expect(session.hashStatus).toBe('failed');
    expect(files[0].contentHash).toBe('');
    expect(session.contentHash).toBeNull();
  });

  it('digest byte-count mismatch marks failed and stores no hash', async () => {
    const prisma: any = fakePrisma();
    const session = completedSession();
    sessions.push(session);
    const storage = {
      download: vi.fn().mockResolvedValue({
        body: Readable.from([Buffer.from('short')]),
        contentLength: 5,
      }),
    };
    await expect(digestMultipartFile(prisma, storage, session)).rejects.toThrow(
      'byte-count mismatch',
    );
    expect(session.hashStatus).toBe('failed');
    expect(files[0].contentHash).toBe('');
  });

  it('digest on an already-ready session is a no-op and never downloads', async () => {
    const prisma: any = fakePrisma();
    const session = completedSession({ hashStatus: 'ready', contentHash: 'abc' });
    sessions.push(session);
    const storage = { download: vi.fn() };
    const result = await digestMultipartFile(prisma, storage, session);
    expect(result.contentHash).toBe('abc');
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('digest claim lost to a concurrent worker skips without downloading', async () => {
    const prisma: any = fakePrisma();
    const session = completedSession();
    sessions.push(session);
    // Another worker already claimed it: simulate by flipping the row to
    // 'hashing' before this caller's updateMany runs.
    prisma.multipartUploadSession.updateMany.mockImplementationOnce(async () => {
      session.hashStatus = 'hashing';
      return { count: 0 };
    });
    const storage = { download: vi.fn() };
    const result = await digestMultipartFile(prisma, storage, session);
    expect(result.skipped).toBe(true);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('resume sweeper digests pending sessions left behind by a restart', async () => {
    const prisma: any = fakePrisma();
    const session = completedSession();
    sessions.push(session);
    sessions.push(
      completedSession({
        id: 'session-2',
        uploadId: 'upload-mp-456',
        fileId: null, // no file row yet: skipped, never digested
      }),
    );
    const bytes = Buffer.from('identical-bytes');
    const storage = {
      download: vi.fn().mockResolvedValue({
        body: Readable.from([bytes]),
        contentLength: bytes.length,
      }),
    };
    const result = await resumePendingMultipartDigests(prisma, storage);
    expect(result.processed).toBe(2);
    expect(result.ready).toBe(1);
    expect(session.hashStatus).toBe('ready');
    expect(files[0].contentHash).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});
