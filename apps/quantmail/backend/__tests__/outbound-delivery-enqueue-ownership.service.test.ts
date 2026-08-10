import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OutboundDeliveryPipeline,
  OUTBOUND_SEND_JOB,
  resolveRedisConnection,
} from '../services/outbound-delivery.service';

/**
 * Unit test for OutboundDeliveryPipeline.enqueueSend ownership enforcement.
 *
 * Task 6.4 — "Write unit test: enqueue ownership rejection".
 * Requirement 4.2: enqueuing an email owned by another user must create NO job.
 *
 * V10 (cross-owner enqueue closed): the ownership gate runs BEFORE any job is
 * created, so a cross-owner request rejects with 403 FORBIDDEN and produces
 * neither a durable queue job nor a deliveryStatus state change.
 */

/** A BullMQ TypedQueue test double; .add is spied to detect job creation. */
function createMockQueue() {
  return {
    add: vi.fn(),
    getJob: vi.fn(),
    addBulk: vi.fn(),
    drain: vi.fn(),
    close: vi.fn(),
  };
}

/** A minimal Prisma test double exposing the email delegate used by the pipeline. */
function createMockPrisma() {
  return {
    email: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

/** Build an email row owned by `ownerId`. Defaults to a valid, unsent draft. */
function makeEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'email-1',
    userId: 'user-A',
    isDraft: true,
    isSent: false,
    subject: 'Quarterly report',
    bodyHtml: '<p>Hello</p>',
    bodyPlain: 'Hello',
    toAddresses: ['bob@example.com'],
    ccAddresses: [],
    bccAddresses: [],
    deliveryStatus: null,
    ...overrides,
  };
}

describe('OutboundDeliveryPipeline.enqueueSend — ownership rejection (Req 4.2 / V10)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let queue: ReturnType<typeof createMockQueue>;
  let pipeline: OutboundDeliveryPipeline;

  beforeEach(() => {
    prisma = createMockPrisma();
    queue = createMockQueue();
    pipeline = new OutboundDeliveryPipeline(prisma as never, queue as never);
  });

  it('rejects a cross-owner enqueue with 403 FORBIDDEN and creates NO job or state change (V10)', async () => {
    // Email is owned by user-A...
    prisma.email.findUnique.mockResolvedValue(makeEmail({ userId: 'user-A' }));

    // ...but user-B attempts to enqueue it.
    await expect(pipeline.enqueueSend('user-B', 'email-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });

    // V10: ownership gate runs before enqueue — no durable job is created...
    expect(queue.add).not.toHaveBeenCalled();
    // ...and no delivery state transition is persisted.
    expect(prisma.email.update).not.toHaveBeenCalled();
  });

  it('rejects with 404 EMAIL_NOT_FOUND and creates no job when the email is missing', async () => {
    prisma.email.findUnique.mockResolvedValue(null);

    await expect(pipeline.enqueueSend('user-B', 'missing-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'EMAIL_NOT_FOUND',
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.email.update).not.toHaveBeenCalled();
  });

  it('positive control: the owner enqueues a valid draft — adds exactly one job and sets deliveryStatus=queued', async () => {
    prisma.email.findUnique.mockResolvedValue(makeEmail({ userId: 'user-A' }));
    queue.add.mockResolvedValue('outbound-delivery:email-1');
    prisma.email.update.mockResolvedValue(makeEmail({ deliveryStatus: 'queued' }));

    const jobId = await pipeline.enqueueSend('user-A', 'email-1');

    expect(jobId).toBe('outbound-delivery:email-1');

    // Exactly one durable job, on the outbound send job name.
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      OUTBOUND_SEND_JOB,
      expect.objectContaining({
        emailId: 'email-1',
        userId: 'user-A',
        to: 'bob@example.com',
        subject: 'Quarterly report',
      }),
      expect.objectContaining({ jobId: 'outbound-delivery:email-1' }),
    );

    // Delivery state advanced to queued exactly once.
    expect(prisma.email.update).toHaveBeenCalledTimes(1);
    expect(prisma.email.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-1' },
        data: expect.objectContaining({ deliveryStatus: 'queued' }),
      }),
    );
  });
});

describe('resolveRedisConnection', () => {
  it('uses REDIS_URL credentials, database, and TLS for producer/worker parity', () => {
    expect(
      resolveRedisConnection({
        REDIS_URL: 'rediss://queue-user:queue-password@redis.internal:6380/4',
      }),
    ).toEqual({
      host: 'redis.internal',
      port: 6380,
      username: 'queue-user',
      password: 'queue-password',
      db: 4,
      tls: {},
    });
  });

  it('falls back to explicit host and port when REDIS_URL is absent', () => {
    expect(resolveRedisConnection({ REDIS_HOST: 'redis.service', REDIS_PORT: '6381' })).toEqual({
      host: 'redis.service',
      port: 6381,
    });
  });

  it('rejects unsupported URL protocols', () => {
    expect(() => resolveRedisConnection({ REDIS_URL: 'http://redis.internal:6379' })).toThrow(
      'REDIS_URL must use redis:// or rediss://',
    );
  });
});
