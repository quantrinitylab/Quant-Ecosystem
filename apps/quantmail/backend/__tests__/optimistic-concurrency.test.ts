/**
 * QM-BACK-002 — optimistic concurrency + request-id correlation.
 *
 * Proves, against offline doubles:
 *  1. A stale expectedVersion loses atomically with 409 VERSION_CONFLICT and
 *     machine-readable details { resource, id, expectedVersion, currentVersion }.
 *  2. Unguarded writes (no expectedVersion) keep working and still bump the
 *     version column, so the column is always truthful.
 *  3. A matching expectedVersion succeeds and increments the version.
 *  4. requestId flows from mutation options into outbox event payloads, so a
 *     retry with the same requestId correlates across the mutation path
 *     (doc 23 correlationId).
 *  5. Thread mutations (mute/unmute/snooze) are guarded the same way.
 *  6. Batch mutations honour per-id expectedVersions; one conflict aborts the
 *     whole batch.
 *  7. expectedVersion parsing rejects corrupt client state loudly (400).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../services/email.service';
import { ThreadService } from '../services/thread.service';
import { versionedUpdate, VersionedTx } from '../lib/optimistic-update';
import {
  VERSION_CONFLICT,
  parseExpectedVersion,
  parseExpectedVersions,
  resolveRequestId,
} from '../lib/mutation-context';

function createMockPrisma() {
  const mock = {
    email: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
    },
    emailThread: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user-1@quantmail.in',
        username: 'user1',
        displayName: 'User One',
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    label: { findMany: vi.fn() },
    emailFolder: {
      findFirst: vi.fn().mockResolvedValue({ id: 'folder-archive' }),
    },
    outboxEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'outbox-1',
        publishedAt: null,
        createdAt: new Date(),
        ...args.data,
      })),
    },
    $transaction: null as unknown as ReturnType<typeof vi.fn>,
  };
  mock.$transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock));
  return mock;
}

describe('versionedUpdate', () => {
  it('succeeds when expectedVersion matches and increments the version', async () => {
    const tx = {
      email: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: 'e1', version: 6 }),
      },
      emailThread: { updateMany: vi.fn(), findUnique: vi.fn() },
    } as unknown as VersionedTx;

    const row = await versionedUpdate<{ id: string; version: number }>(tx, {
      id: 'e1',
      resource: 'Email',
      notFoundCode: 'EMAIL_NOT_FOUND',
      notFoundMessage: 'Email not found',
      expectedVersion: 5,
      data: { isRead: true },
    });

    expect(tx.email.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', version: 5 },
      data: { isRead: true, version: { increment: 1 } },
    });
    expect(row.version).toBe(6);
  });

  it('throws 409 VERSION_CONFLICT with recovery details on a stale version', async () => {
    const tx = {
      email: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ id: 'e1', version: 9 }),
      },
      emailThread: { updateMany: vi.fn(), findUnique: vi.fn() },
    } as unknown as VersionedTx;

    const err = await versionedUpdate(tx, {
      id: 'e1',
      resource: 'Email',
      notFoundCode: 'EMAIL_NOT_FOUND',
      notFoundMessage: 'Email not found',
      expectedVersion: 5,
      data: { isRead: true },
    }).then(
      () => null,
      (e: any) => e,
    );

    expect(err).not.toBeNull();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe(VERSION_CONFLICT);
    expect(err.details).toMatchObject({
      resource: 'Email',
      id: 'e1',
      expectedVersion: 5,
      currentVersion: 9,
    });
  });

  it('writes unguarded (backward compatible) when expectedVersion is absent, still bumping version', async () => {
    const tx = {
      email: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: 'e1', version: 3 }),
      },
      emailThread: { updateMany: vi.fn(), findUnique: vi.fn() },
    } as unknown as VersionedTx;

    await versionedUpdate(tx, {
      id: 'e1',
      resource: 'Email',
      notFoundCode: 'EMAIL_NOT_FOUND',
      notFoundMessage: 'Email not found',
      data: { isStarred: true },
    });

    // No version predicate — legacy callers keep working — but the column moves.
    expect(tx.email.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { isStarred: true, version: { increment: 1 } },
    });
  });

  it('throws 404 when the row vanished', async () => {
    const tx = {
      email: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      emailThread: { updateMany: vi.fn(), findUnique: vi.fn() },
    } as unknown as VersionedTx;

    await expect(
      versionedUpdate(tx, {
        id: 'gone',
        resource: 'Email',
        notFoundCode: 'EMAIL_NOT_FOUND',
        notFoundMessage: 'Email not found',
        data: { isRead: true },
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'EMAIL_NOT_FOUND' });
  });
});

describe('EmailService optimistic concurrency', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: EmailService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmailService(prisma as never);
  });

  it('markRead honours a matching expectedVersion', async () => {
    prisma.email.findUnique
      .mockResolvedValueOnce({ id: 'e1', userId: 'user-1', isRead: false, isSent: true, version: 4 })
      .mockResolvedValueOnce({ id: 'e1', userId: 'user-1', isRead: true, version: 5 });

    const result = await service.markRead('e1', 'user-1', { expectedVersion: 4 });

    expect(result.isRead).toBe(true);
    expect(prisma.email.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', version: 4 },
      data: { isRead: true, readAt: expect.any(Date), version: { increment: 1 } },
    });
  });

  it('markRead raises VERSION_CONFLICT on a stale expectedVersion', async () => {
    prisma.email.findUnique.mockResolvedValue({
      id: 'e1',
      userId: 'user-1',
      isRead: false,
      isSent: true,
      version: 7,
    });
    prisma.email.updateMany.mockResolvedValue({ count: 0 });

    const err = await service.markRead('e1', 'user-1', { expectedVersion: 4 }).then(
      () => null,
      (e: any) => e,
    );

    expect(err).toMatchObject({ statusCode: 409, code: VERSION_CONFLICT });
    expect(err.details).toMatchObject({
      resource: 'Email',
      id: 'e1',
      expectedVersion: 4,
      currentVersion: 7,
    });
  });

  it('archive stamps requestId into the outbox payload (doc 23 correlationId)', async () => {
    prisma.email.findUnique
      .mockResolvedValueOnce({ id: 'e1', userId: 'user-1', folderId: 'inbox', version: 2 })
      .mockResolvedValueOnce({ id: 'e1', userId: 'user-1', folderId: 'folder-archive', version: 3 });

    await service.archive('e1', 'folder-archive', 'user-1', { requestId: 'req_retry-1' });

    const outboxCall = prisma.outboxEvent.create.mock.calls[0][0];
    expect(outboxCall.data.payload).toMatchObject({ requestId: 'req_retry-1' });
  });

  it('idempotent retry with the same requestId correlates across attempts', async () => {
    // First attempt: fresh version, succeeds.
    prisma.email.findUnique
      .mockResolvedValueOnce({ id: 'e1', userId: 'user-1', folderId: 'inbox', version: 2 })
      .mockResolvedValueOnce({ id: 'e1', userId: 'user-1', folderId: 'folder-archive', version: 3 });
    await service.archive('e1', 'folder-archive', 'user-1', {
      expectedVersion: 2,
      requestId: 'req_retry-1',
    });

    // Retry after the client re-reads (version moved to 3): same requestId.
    prisma.email.findUnique
      .mockResolvedValueOnce({ id: 'e1', userId: 'user-1', folderId: 'folder-archive', version: 3 })
      .mockResolvedValueOnce({ id: 'e1', userId: 'user-1', folderId: 'folder-archive', version: 4 });
    await service.archive('e1', 'folder-archive', 'user-1', {
      expectedVersion: 3,
      requestId: 'req_retry-1',
    });

    const payloads = prisma.outboxEvent.create.mock.calls.map((c) => c[0].data.payload);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ requestId: 'req_retry-1' });
    expect(payloads[1]).toMatchObject({ requestId: 'req_retry-1' });
  });

  it('batchMarkRead guards per-id versions; one conflict aborts the batch', async () => {
    // e1 matches, e2 is stale.
    prisma.email.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.email.findUnique.mockResolvedValue({ id: 'e2', version: 9 });

    const err = await service
      .batchMarkRead(['e1', 'e2'], 'user-1', true, {
        expectedVersions: { e1: 2, e2: 3 },
        requestId: 'req_batch-1',
      })
      .then(
        () => null,
        (e: any) => e,
      );

    expect(err).toMatchObject({ statusCode: 409, code: VERSION_CONFLICT });
    expect(err.details).toMatchObject({ id: 'e2', expectedVersion: 3, currentVersion: 9 });
    // First item was guarded on its own version; second carried its stale one.
    expect(prisma.email.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'e1', version: 2 },
      data: { isRead: true, version: { increment: 1 } },
    });
    expect(prisma.email.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'e2', version: 3 },
      data: { isRead: true, version: { increment: 1 } },
    });
  });

  it('batchMarkRead without expectedVersions stays on the fast path and bumps versions', async () => {
    prisma.email.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.batchMarkRead(['e1', 'e2', 'e3'], 'user-1', true);

    expect(result.count).toBe(3);
    expect(prisma.email.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2', 'e3'] }, userId: 'user-1', deletedAt: null },
      data: { isRead: true, updatedAt: expect.any(Date), version: { increment: 1 } },
    });
  });
});

describe('ThreadService optimistic concurrency', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ThreadService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ThreadService(prisma as never);
  });

  it('muteThread raises VERSION_CONFLICT on a stale expectedVersion', async () => {
    prisma.emailThread.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'user-1',
      isMuted: false,
      version: 11,
    });
    prisma.emailThread.updateMany.mockResolvedValue({ count: 0 });

    const err = await service.muteThread('t1', 'user-1', { expectedVersion: 5 }).then(
      () => null,
      (e: any) => e,
    );

    expect(err).toMatchObject({ statusCode: 409, code: VERSION_CONFLICT });
    expect(err.details).toMatchObject({
      resource: 'EmailThread',
      id: 't1',
      expectedVersion: 5,
      currentVersion: 11,
    });
  });

  it('muteThread succeeds unguarded (backward compatible) and bumps the version', async () => {
    prisma.emailThread.findUnique
      .mockResolvedValueOnce({ id: 't1', userId: 'user-1', isMuted: false, version: 2 })
      .mockResolvedValueOnce({ id: 't1', userId: 'user-1', isMuted: true, version: 3 });

    const result = await service.muteThread('t1', 'user-1');

    expect(result.preferences.isMuted).toBe(true);
    expect(prisma.emailThread.updateMany).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { isMuted: true, version: { increment: 1 } },
    });
  });
});

describe('mutation context parsing', () => {
  it('parseExpectedVersion accepts a non-negative integer and undefined', () => {
    expect(parseExpectedVersion({ expectedVersion: 3 })).toBe(3);
    expect(parseExpectedVersion({ expectedVersion: 0 })).toBe(0);
    expect(parseExpectedVersion({})).toBeUndefined();
    expect(parseExpectedVersion(null)).toBeUndefined();
  });

  it('parseExpectedVersion rejects corrupt client state loudly', () => {
    for (const bad of [{ expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: '3' }]) {
      expect(() => parseExpectedVersion(bad)).toThrowError(
        expect.objectContaining({ statusCode: 400, code: 'INVALID_EXPECTED_VERSION' }),
      );
    }
  });

  it('parseExpectedVersions validates the per-id map', () => {
    expect(parseExpectedVersions({ expectedVersions: { a: 1, b: 0 } })).toEqual({ a: 1, b: 0 });
    expect(parseExpectedVersions({})).toBeUndefined();
    expect(() => parseExpectedVersions({ expectedVersions: { a: -2 } })).toThrowError(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_EXPECTED_VERSION' }),
    );
    expect(() => parseExpectedVersions({ expectedVersions: ['a'] })).toThrowError(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_EXPECTED_VERSION' }),
    );
  });

  it('resolveRequestId prefers the stamped reply header, then the request header, then generates', () => {
    expect(
      resolveRequestId(
        { headers: { 'x-request-id': 'req_from-header' } },
        { getHeader: () => 'req_from-plugin' },
      ),
    ).toBe('req_from-plugin');
    expect(
      resolveRequestId({ headers: { 'x-request-id': 'req_from-header' } }, { getHeader: () => undefined }),
    ).toBe('req_from-header');
    // Unsafe client values are ignored, not trusted.
    expect(
      resolveRequestId({ headers: { 'x-request-id': 'evil\ninjection' } }, { getHeader: () => undefined }),
    ).toMatch(/^req_/);
    expect(resolveRequestId()).toMatch(/^req_/);
  });
});
