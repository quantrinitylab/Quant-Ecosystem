import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StuckSendReconciler,
  STUCK_QUEUED_THRESHOLD_MS,
} from '../services/stuck-send-reconciler.service';

/**
 * Unit tests for the stuck-send reconciler (fix/qm-stuck-send-reconciler).
 *
 * The flip-first send commits (isSent=true, deliveryStatus='queued' + the
 * outboundQueued outbox row) BEFORE the delivery job is enqueued. A process
 * loss in between leaves a 'queued' row with ZERO jobs, and the send-once
 * guard turns every retry into 409 — stuck forever without this sweep.
 */

function makeRow(overrides: Record<string, unknown> = {}) {
  const old = new Date(Date.now() - STUCK_QUEUED_THRESHOLD_MS - 60_000);
  return {
    id: 'email-1',
    userId: 'user-1',
    version: 3,
    isSent: true,
    deliveryStatus: 'queued',
    sentAt: new Date(Date.now() - 3_600_000),
    updatedAt: old,
    ...overrides,
  };
}

function createMockPrisma() {
  const mock = {
    email: {
      // QM-BACK-002: versionedUpdate's conditional updateMany resolves
      // { count: 1 } by default; conflict tests override per-test.
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'outbox-1',
        ...args.data,
      })),
    },
    $transaction: null as unknown as ReturnType<typeof vi.fn>,
  };
  // K1: mutations run inside prisma.$transaction — the double passes the
  // mock itself as the tx client.
  mock.$transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock));
  return mock;
}

function createMockPipeline() {
  return {
    enqueueSend: vi.fn().mockResolvedValue('outbound-delivery-email-1'),
    hasJob: vi.fn().mockResolvedValue(false),
  };
}

describe('StuckSendReconciler.reconcileOnce', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let pipeline: ReturnType<typeof createMockPipeline>;
  let reconciler: StuckSendReconciler;

  beforeEach(() => {
    prisma = createMockPrisma();
    pipeline = createMockPipeline();
    reconciler = new StuckSendReconciler(prisma as never, pipeline as never, {
      log: () => {},
    });
  });

  it('re-enqueues a stuck row that has no queue job and emits a reconciled outbox event', async () => {
    const row = makeRow();
    prisma.email.findMany.mockResolvedValue([row]);
    prisma.email.findUnique.mockResolvedValue(row);

    const outcome = await reconciler.reconcileOnce();

    expect(outcome).toMatchObject({ scanned: 1, requeued: 1, errors: 0 });
    // Queue-ownership probe ran before any DB write.
    expect(pipeline.hasJob).toHaveBeenCalledWith('email-1');
    // Re-enqueue went through the pipeline (deterministic job id dedupes).
    expect(pipeline.enqueueSend).toHaveBeenCalledWith('user-1', 'email-1', {});
    // The claim is an atomic conditional version write (two-replica guard).
    expect(prisma.email.updateMany).toHaveBeenCalledWith({
      where: { id: 'email-1', version: 3 },
      data: { version: { increment: 1 } },
    });
    // The reconciled re-queue reuses the spec'd queued event name with a
    // reconciled marker — no invented event names.
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'mail.outbound.queued.v1',
        aggregateId: 'email-1',
        payload: expect.objectContaining({
          reconciled: true,
          reason: 'stuck-send-reconciler',
          deliveryStatus: 'queued',
        }),
      }),
    });
  });

  it('does NOT re-enqueue when the queue still owns the job (queue-accept-then-timeout)', async () => {
    const row = makeRow();
    prisma.email.findMany.mockResolvedValue([row]);
    pipeline.hasJob.mockResolvedValue(true);

    const outcome = await reconciler.reconcileOnce();

    expect(outcome).toMatchObject({ scanned: 1, requeued: 0, skippedInFlight: 1 });
    expect(pipeline.enqueueSend).not.toHaveBeenCalled();
    expect(prisma.email.updateMany).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('skips rows that are no longer stuck on re-read (delivered while scanning)', async () => {
    const row = makeRow();
    prisma.email.findMany.mockResolvedValue([row]);
    prisma.email.findUnique.mockResolvedValue({ ...row, deliveryStatus: 'delivered' });

    const outcome = await reconciler.reconcileOnce();

    expect(outcome).toMatchObject({ scanned: 1, requeued: 0, skippedNotStuck: 1 });
    expect(pipeline.enqueueSend).not.toHaveBeenCalled();
  });

  it('skips rows touched recently (below the stuck threshold)', async () => {
    const row = makeRow({ updatedAt: new Date() });
    prisma.email.findMany.mockResolvedValue([row]);
    prisma.email.findUnique.mockResolvedValue(row);

    const outcome = await reconciler.reconcileOnce();

    expect(outcome).toMatchObject({ scanned: 1, requeued: 0, skippedNotStuck: 1 });
    expect(pipeline.enqueueSend).not.toHaveBeenCalled();
  });

  it('loses the claim cleanly on VERSION_CONFLICT (two replicas raced)', async () => {
    const row = makeRow();
    prisma.email.findMany.mockResolvedValue([row]);
    prisma.email.findUnique.mockResolvedValue(row);
    // The other replica (or an undo-send) bumped the version first: the
    // conditional claim matches zero rows, then versionedUpdate re-reads and
    // raises VERSION_CONFLICT.
    prisma.email.updateMany.mockResolvedValueOnce({ count: 0 });

    const outcome = await reconciler.reconcileOnce();

    expect(outcome).toMatchObject({ scanned: 1, requeued: 0, skippedClaimLost: 1, errors: 0 });
    expect(pipeline.enqueueSend).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('re-enqueues a stuck SCHEDULED send with its original sendAt + delay (never early)', async () => {
    const future = new Date(Date.now() + 3_600_000);
    const row = makeRow({ sentAt: future });
    prisma.email.findMany.mockResolvedValue([row]);
    prisma.email.findUnique.mockResolvedValue(row);

    const now = new Date();
    const outcome = await reconciler.reconcileOnce(now);

    expect(outcome).toMatchObject({ scanned: 1, requeued: 1 });
    expect(pipeline.enqueueSend).toHaveBeenCalledWith('user-1', 'email-1', {
      sendAt: future,
      delayMs: future.getTime() - now.getTime(),
    });
  });

  it('never touches rows that are not queued (unknown outcomes are preserved, not re-enqueued)', async () => {
    // The scan itself only matches deliveryStatus='queued'.
    prisma.email.findMany.mockResolvedValue([]);

    const outcome = await reconciler.reconcileOnce();

    expect(prisma.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isSent: true,
          deliveryStatus: 'queued',
          updatedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );
    expect(outcome).toMatchObject({ scanned: 0, requeued: 0 });
  });

  it('counts a failed enqueue as an error and keeps sweeping the rest', async () => {
    const rowA = makeRow({ id: 'email-A' });
    const rowB = makeRow({ id: 'email-B' });
    prisma.email.findMany.mockResolvedValue([rowA, rowB]);
    prisma.email.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'email-A' ? rowA : rowB,
    );
    pipeline.enqueueSend.mockImplementation(async (_u: string, id: string) => {
      if (id === 'email-A') throw new Error('redis exploded');
      return `job-${id}`;
    });

    const outcome = await reconciler.reconcileOnce();

    expect(outcome).toMatchObject({ scanned: 2, requeued: 1, errors: 1 });
  });

  it('fails the scan closed on DB error (no throw, counted)', async () => {
    prisma.email.findMany.mockRejectedValue(new Error('db down'));

    const outcome = await reconciler.reconcileOnce();

    expect(outcome).toMatchObject({ scanned: 0, errors: 1 });
  });

  it('skips the re-enqueue when the queue probe itself fails (fail closed, no storm)', async () => {
    const row = makeRow();
    prisma.email.findMany.mockResolvedValue([row]);
    pipeline.hasJob.mockRejectedValue(new Error('redis down'));

    const outcome = await reconciler.reconcileOnce();

    expect(outcome).toMatchObject({ scanned: 1, requeued: 0, skippedNotStuck: 1, errors: 0 });
    expect(pipeline.enqueueSend).not.toHaveBeenCalled();
    expect(prisma.email.updateMany).not.toHaveBeenCalled();
  });
});
