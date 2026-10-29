// @vitest-environment node
// ============================================================================
// Fire-time send-as re-authorization for the delivery worker (PR #1529,
// CODEX checkpoint 6382393391 — the schedule-fire alias linearization gap).
//
// EmailService.send() re-authorizes the persisted send-as identity at
// SCHEDULE time and stamps its values on the row, but the delayed job fires
// later. A revoke/delete of the alias in between must not still go out:
// the worker must re-authorize at FIRE time, before ANY transmit.
//
//   • Live identity → the CURRENT values are the effective From (a rename
//     between scheduling and firing sends with the fresh name).
//   • Revoked / deleted / other-user identity → NOTHING transmits; the
//     message returns to Drafts with `mail.outbound.cancelled.v1`
//     (reason send_as_revoked). Never silently re-addressed, never thrown
//     (a throw would BullMQ-retry a permanently-denied send).
//   • No persisted identity id (the account's own address) → the gate is
//     skipped entirely; the row's From transmits as before.
//   • The gate covers undo-window jobs too, not just scheduled ones — both
//     share this worker path and the same revoke window.
//
// The REAL reauthorizeSendAsIdentity runs here (the prisma double only
// supplies the sendAsIdentity row); only network/chrome dependencies are
// mocked, mirroring delivery-worker-scheduled-suppression.test.ts.
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

const T0 = '2026-10-09T00:00:00.000Z';
const T2 = '2026-10-09T01:30:00.000Z';

function makeAliasEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'email-1',
    userId: 'user-1',
    // Stamped at schedule time, when the alias was still live.
    fromAddress: 'alias-old@example.com',
    fromName: 'Old Name',
    sendAsIdentityId: 'alias-1',
    subject: 'scheduled with alias',
    bodyHtml: '<p>hello</p>',
    bodyPlain: 'hello',
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

function makeIdentity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alias-1',
    userId: 'user-1',
    email: 'alias-new@example.com',
    displayName: 'New Name',
    verifiedAt: new Date(T0),
    ...overrides,
  };
}

function makePrisma(email: Record<string, unknown>) {
  const attempts = new Map<string, Record<string, unknown>>();
  const txUpdate = vi
    .fn()
    .mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...email,
      ...data,
    }));
  const outboxCreate = vi.fn().mockResolvedValue({ id: 'outbox-1' });
  const mocks = {
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
    sendAsIdentity: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
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

type PrismaMocks = ReturnType<typeof makePrisma>;

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
    subject: 'scheduled with alias',
    body: 'hello',
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

describe('DeliveryWorker fire-time send-as re-authorization', () => {
  it('transmits a live alias with its CURRENT values (rename between schedule and fire)', async () => {
    const prisma = makePrisma(makeAliasEmail());
    prisma.sendAsIdentity.findUnique.mockResolvedValue(makeIdentity());
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    expect(sendViaSesMock).toHaveBeenCalledTimes(1);
    const sesArg = sendViaSesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(sesArg.from).toBe('New Name <alias-new@example.com>');
    expect(sesArg.replyTo).toBe('alias-new@example.com');
    expect(result.deliveryStatus).toBe('sent');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT transmit when the alias was revoked (row deleted) between schedule and fire', async () => {
    const prisma = makePrisma(makeAliasEmail());
    prisma.sendAsIdentity.findUnique.mockResolvedValue(null);
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    expect(sendViaSesMock).not.toHaveBeenCalled();
    expect(deliverInternallyMock).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.txUpdate.mock.calls[0][0].data).toMatchObject({
      isDraft: true,
      isSent: false,
      sentAt: null,
      deliveryStatus: 'draft',
      folderId: 'drafts-folder',
    });
    expect(prisma.outboxCreate).toHaveBeenCalledTimes(1);
    expect(prisma.outboxCreate.mock.calls[0][0].data).toMatchObject({
      eventType: 'mail.outbound.cancelled.v1',
      aggregateType: 'Email',
      aggregateId: 'email-1',
    });
    const payload = prisma.outboxCreate.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.reason).toBe('send_as_revoked');
    expect(payload.sendAsIdentityId).toBe('alias-1');
    expect(result.deliveryStatus).toBe('draft');
    expect(result.recipients).toEqual([]);
  });

  it('does NOT transmit when the identity belongs to another user', async () => {
    const prisma = makePrisma(makeAliasEmail());
    prisma.sendAsIdentity.findUnique.mockResolvedValue(makeIdentity({ userId: 'user-2' }));
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    expect(sendViaSesMock).not.toHaveBeenCalled();
    expect(deliverInternallyMock).not.toHaveBeenCalled();
    expect(result.deliveryStatus).toBe('draft');
    const payload = prisma.outboxCreate.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.reason).toBe('send_as_revoked');
  });

  it('does NOT transmit when the identity is no longer verified', async () => {
    const prisma = makePrisma(makeAliasEmail());
    prisma.sendAsIdentity.findUnique.mockResolvedValue(makeIdentity({ verifiedAt: null }));
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    expect(sendViaSesMock).not.toHaveBeenCalled();
    expect(result.deliveryStatus).toBe('draft');
  });

  it('skips the gate for the account’s own address (no persisted identity id)', async () => {
    const prisma = makePrisma(
      makeAliasEmail({ sendAsIdentityId: null, fromAddress: 'me@quantmail.in', fromName: 'Me' }),
    );
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({ data: scheduledJobPayload() });

    expect(prisma.sendAsIdentity.findUnique).not.toHaveBeenCalled();
    expect(sendViaSesMock).toHaveBeenCalledTimes(1);
    const sesArg = sendViaSesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(sesArg.from).toBe('Me <me@quantmail.in>');
    expect(result.deliveryStatus).toBe('sent');
  });

  it('also blocks an undo-window job (no scheduledFor) whose alias was revoked', async () => {
    const prisma = makePrisma(makeAliasEmail());
    prisma.sendAsIdentity.findUnique.mockResolvedValue(null);
    const worker = makeWorker(prisma);

    const { scheduledFor: _sf, scheduledAt: _sa, ...immediatePayload } = scheduledJobPayload();
    const result = await worker.processDelivery({ data: immediatePayload });

    expect(sendViaSesMock).not.toHaveBeenCalled();
    expect(result.deliveryStatus).toBe('draft');
    const payload = prisma.outboxCreate.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.reason).toBe('send_as_revoked');
    expect(payload.sendAsIdentityId).toBe('alias-1');
  });
});
