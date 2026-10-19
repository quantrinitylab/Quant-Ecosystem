// @vitest-environment node
// ============================================================================
// Reply-arrival suppression for scheduled sends (Superhuman parity).
//
// A scheduled send that fires AFTER the recipient already replied produces the
// awkward "just following up!"-after-a-reply. The delivery worker must hold the
// message instead: return it to Drafts and emit `mail.outbound.cancelled.v1`.
// Immediate and undo-window sends (no `scheduledFor` on the job) are untouched,
// and a reply that arrived BEFORE the send was scheduled does not suppress.
//
// Also covered: the worker fire-gate — a job that outlives its send (user
// cancelled via cancel-send, manual retry, crash-retry after a terminal state)
// must never transmit; only a still-`queued` row may fire.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { deliverInternallyMock, sendViaSesMock, isSesConfiguredMock } = vi.hoisted(() => ({
  deliverInternallyMock: vi.fn().mockResolvedValue(1),
  sendViaSesMock: vi.fn().mockResolvedValue(undefined),
  isSesConfiguredMock: vi.fn().mockReturnValue(true),
}));

vi.mock('../services/email.service', () => ({
  // NOTE: must be a `function`, not an arrow function — the worker does
  // `new EmailService(...)`, and arrow functions are not constructable.
  EmailService: vi.fn().mockImplementation(function (this: unknown) {
    (this as { deliverInternally: unknown }).deliverInternally = deliverInternallyMock;
  }),
}));

vi.mock('../lib/ses-sender', () => ({
  isSesConfigured: isSesConfiguredMock,
  sendViaSes: sendViaSesMock,
}));

import { DeliveryWorker } from '../services/delivery-worker.service';

// Timeline (all UTC):
//   T0 = 2026-10-09T00:00:00Z — user schedules the send
//   T1 = 2026-10-09T01:00:00Z — inbound reply arrives
//   T2 = 2026-10-09T01:30:00Z — scheduled fire time
//   T3 = 2026-10-09T02:00:00Z — worker fires (now)
const T0 = '2026-10-09T00:00:00.000Z';
const T2 = '2026-10-09T01:30:00.000Z';
const REPLY_AFTER = '2026-10-09T01:00:00.000Z';
const REPLY_BEFORE = '2026-10-08T23:00:00.000Z';

function makeScheduledEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'email-1',
    userId: 'user-1',
    fromAddress: 'me@quantmail.in',
    fromName: 'Me',
    subject: 'follow-up',
    bodyHtml: '<p>just following up!</p>',
    bodyPlain: 'just following up!',
    toAddresses: ['alice@example.com'],
    ccAddresses: [],
    bccAddresses: [],
    threadId: 'thread-1',
    inReplyTo: null,
    attachments: [],
    messageKind: 'MAIL',
    messageId: '<email-1@quantmail.in>',
    deliveryStatus: 'queued',
    isSent: true,
    isDraft: false,
    sentAt: new Date(T2),
    ...overrides,
  };
}

function makeReplyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reply-1',
    fromAddress: 'alice@example.com',
    receivedAt: new Date(REPLY_AFTER),
    ...overrides,
  };
}

interface PrismaMocks {
  email: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  emailFolder: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  user: { findMany: ReturnType<typeof vi.fn> };
  deliveryAttempt: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
  txUpdate: ReturnType<typeof vi.fn>;
  outboxCreate: ReturnType<typeof vi.fn>;
}

function makePrisma(email: Record<string, unknown>): PrismaMocks {
  const attempts = new Map<string, Record<string, unknown>>();
  const txUpdate = vi
    .fn()
    .mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...email,
      ...data,
    }));
  const outboxCreate = vi.fn().mockResolvedValue({ id: 'outbox-1' });
  const mocks: PrismaMocks = {
    email: {
      findUnique: vi.fn().mockResolvedValue(email),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...email,
        ...data,
      })),
    },
    emailFolder: {
      findFirst: vi.fn().mockResolvedValue({ id: 'drafts-folder' }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'drafts-folder',
        ...data,
      })),
    },
    // No internal users → every recipient is external → SES path.
    user: { findMany: vi.fn().mockResolvedValue([]) },
    deliveryAttempt: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: unknown }) => {
        const w = where as { emailId_recipient: { emailId: string; recipient: string } };
        return attempts.get(`${w.emailId_recipient.emailId}:${w.emailId_recipient.recipient}`) ?? null;
      }),
      upsert: vi.fn().mockImplementation(async ({ where, create }: { where: unknown; create: Record<string, unknown> }) => {
        const w = where as { emailId_recipient: { emailId: string; recipient: string } };
        const key = `${w.emailId_recipient.emailId}:${w.emailId_recipient.recipient}`;
        attempts.set(key, { ...create });
        return { ...create };
      }),
    },
    $transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        email: { update: txUpdate },
        outboxEvent: { create: outboxCreate },
      }),
    ),
    txUpdate,
    outboxCreate,
  };
  return mocks;
}

function makeWorker(prisma: PrismaMocks) {
  const auth = { getDkimSigner: vi.fn() };
  return new DeliveryWorker(prisma as never, auth as never, {
    smtp: {} as never,
    mx: {} as never,
    senderDomain: 'quantmail.in',
    now: () => new Date('2026-10-09T02:00:00Z'),
  });
}

function scheduledJobPayload(extra: Record<string, unknown> = {}) {
  return {
    to: 'alice@example.com',
    subject: 'follow-up',
    body: 'just following up!',
    emailId: 'email-1',
    userId: 'user-1',
    scheduledFor: T2,
    scheduledAt: T0,
    ...extra,
  };
}

beforeEach(() => {
  deliverInternallyMock.mockClear();
  sendViaSesMock.mockClear();
  isSesConfiguredMock.mockClear();
  isSesConfiguredMock.mockReturnValue(true);
});

describe('DeliveryWorker reply-arrival suppression (scheduled sends)', () => {
  it('transmits a scheduled send when no inbound reply arrived', async () => {
    const prisma = makePrisma(makeScheduledEmail());
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    expect(sendViaSesMock).toHaveBeenCalledTimes(1);
    expect(result.deliveryStatus).toBe('sent');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.outboxCreate).not.toHaveBeenCalled();
  });

  it('suppresses a scheduled send when an inbound reply arrived after scheduling', async () => {
    const prisma = makePrisma(makeScheduledEmail());
    prisma.email.findFirst.mockResolvedValue(makeReplyRow());
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    // Nothing transmitted…
    expect(sendViaSesMock).not.toHaveBeenCalled();
    expect(deliverInternallyMock).not.toHaveBeenCalled();
    // …the send is returned to Drafts…
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.txUpdate).toHaveBeenCalledTimes(1);
    expect(prisma.txUpdate.mock.calls[0][0].data).toMatchObject({
      isDraft: true,
      isSent: false,
      sentAt: null,
      deliveryStatus: 'draft',
      folderId: 'drafts-folder',
    });
    // …and the cancellation is announced honestly with the reply's identity.
    expect(prisma.outboxCreate).toHaveBeenCalledTimes(1);
    expect(prisma.outboxCreate.mock.calls[0][0].data).toMatchObject({
      eventType: 'mail.outbound.cancelled.v1',
      aggregateType: 'Email',
      aggregateId: 'email-1',
    });
    const payload = prisma.outboxCreate.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.reason).toBe('inbound_reply');
    expect(payload.suppressedByReplyId).toBe('reply-1');
    expect(payload.replyFrom).toBe('alice@example.com');
    expect(result.deliveryStatus).toBe('draft');
    expect(result.recipients).toEqual([]);
  });

  it('passes the schedule window to the reply query (thread-scoped, excludes self)', async () => {
    const prisma = makePrisma(makeScheduledEmail());
    prisma.email.findFirst.mockResolvedValue(makeReplyRow());
    const worker = makeWorker(prisma);

    await worker.processDelivery({ data: scheduledJobPayload() });

    const where = prisma.email.findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.threadId).toBe('thread-1');
    expect(where.isSent).toBe(false);
    expect(where.isDraft).toBe(false);
    // Schedule window: receivedAt OR createdAt after the schedule moment T0.
    const or = where.OR as Array<Record<string, Record<string, Date>>>;
    expect(or).toHaveLength(2);
    const moments = or.map((c) => Object.values(c)[0].gt.toISOString());
    expect(moments).toEqual([T0, T0]);
    // The user's own address must not count as a "reply".
    expect(where.NOT).toMatchObject({
      fromAddress: { equals: 'me@quantmail.in', mode: 'insensitive' },
    });
  });

  it('does NOT suppress when the only reply arrived BEFORE the send was scheduled', async () => {
    const prisma = makePrisma(makeScheduledEmail());
    // findFirst returns null: the reply predates T0, so it is outside the window.
    prisma.email.findFirst.mockResolvedValue(null);
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    expect(sendViaSesMock).toHaveBeenCalledTimes(1);
    expect(result.deliveryStatus).toBe('sent');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT suppress immediate/undo-window sends even when a reply exists (no scheduledFor)', async () => {
    const email = makeScheduledEmail({ sentAt: new Date('2026-10-09T02:00:00Z') });
    const prisma = makePrisma(email);
    prisma.email.findFirst.mockResolvedValue(makeReplyRow());
    const worker = makeWorker(prisma);

    // No scheduledFor → not a scheduled send → the reply check never runs.
    const { scheduledFor: _sf, scheduledAt: _sa, ...immediatePayload } = scheduledJobPayload();
    const result = await worker.processDelivery({ data: immediatePayload });

    expect(prisma.email.findFirst).not.toHaveBeenCalled();
    expect(sendViaSesMock).toHaveBeenCalledTimes(1);
    expect(result.deliveryStatus).toBe('sent');
  });

  it('suppresses a thread-less scheduled send on an inbound message FROM a recipient', async () => {
    const prisma = makePrisma(makeScheduledEmail({ threadId: null }));
    prisma.email.findFirst.mockResolvedValue(makeReplyRow());
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    expect(sendViaSesMock).not.toHaveBeenCalled();
    expect(result.deliveryStatus).toBe('draft');
    const where = prisma.email.findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.threadId).toBeUndefined();
    expect(where.fromAddress).toMatchObject({ in: ['alice@example.com'], mode: 'insensitive' });
  });

  it('creates the Drafts folder when it does not exist during suppression', async () => {
    const prisma = makePrisma(makeScheduledEmail());
    prisma.email.findFirst.mockResolvedValue(makeReplyRow());
    prisma.emailFolder.findFirst.mockResolvedValue(null);
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    expect(prisma.emailFolder.create).toHaveBeenCalledTimes(1);
    expect(result.deliveryStatus).toBe('draft');
  });
});

describe('DeliveryWorker fire-gate (job outlives its send)', () => {
  // fix/qm-stuck-send-reconciler: 'unknown' (transmit outcome uncertain —
  // provider accepted but the response was lost) must never fire either.
  it.each(['draft', 'sent', 'delivered', 'bounced', 'unknown'] as const)(
    'never transmits when the row is already %s (e.g. user cancelled via cancel-send)',
    async (deliveryStatus) => {
      const prisma = makePrisma(
        makeScheduledEmail({ deliveryStatus, isDraft: deliveryStatus === 'draft', isSent: deliveryStatus !== 'draft' }),
      );
      const worker = makeWorker(prisma);

      const result = await worker.processDelivery({ data: scheduledJobPayload() });

      expect(sendViaSesMock).not.toHaveBeenCalled();
      expect(deliverInternallyMock).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.deliveryStatus).toBe(deliveryStatus);
      expect(result.recipients).toEqual([]);
    },
  );

  it('still fires when the row is deferred (BullMQ backoff retry)', async () => {
    const prisma = makePrisma(makeScheduledEmail({ deliveryStatus: 'deferred' }));
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    expect(sendViaSesMock).toHaveBeenCalledTimes(1);
    expect(result.deliveryStatus).toBe('sent');
  });
});
