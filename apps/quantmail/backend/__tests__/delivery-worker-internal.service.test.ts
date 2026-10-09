// @vitest-environment node
// ============================================================================
// P0 regression test: delayed sends (e.g. /compose's 10s undo window) to
// QuantMail-internal recipients must create inbox copies via internal delivery.
// Before the fix, DeliveryWorker.processDelivery had no internal-delivery path:
// the route skips deliverInternally for delayed sends, the worker only did
// SES/SMTP, so /compose sends to @quantmail.in addresses were queued, never
// delivered, and vanished (not in Sent, not in the recipient's inbox).
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

function makePrisma(email: any, users: Array<{ email: string; username: string | null }>) {
  const attempts = new Map<string, any>();
  return {
    email: {
      findUnique: vi.fn().mockResolvedValue(email),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...email, ...data })),
    },
    user: {
      findMany: vi.fn().mockResolvedValue(users),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    deliveryAttempt: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const key = `${where.emailId_recipient.emailId}:${where.emailId_recipient.recipient}`;
        return attempts.get(key) ?? null;
      }),
      upsert: vi.fn().mockImplementation(async ({ where, create }: any) => {
        const key = `${where.emailId_recipient.emailId}:${where.emailId_recipient.recipient}`;
        const row = { ...create };
        attempts.set(key, row);
        return row;
      }),
    },
  };
}

function makeEmail(overrides: any = {}) {
  return {
    id: 'email-1',
    userId: 'user-1',
    fromAddress: 'kundan@quantmail.in',
    fromName: 'Kundan',
    subject: 'hello',
    bodyHtml: '<p>hi</p>',
    bodyPlain: 'hi',
    toAddresses: ['kundan@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    threadId: null,
    inReplyTo: null,
    attachments: [],
    messageKind: 'MAIL',
    messageId: '<email-1@quantmail.in>',
    deliveryStatus: 'queued',
    isSent: false,
    isDraft: true,
    ...overrides,
  };
}

function makeWorker(prisma: any) {
  const auth = { getDkimSigner: vi.fn() };
  return new DeliveryWorker(prisma as any, auth as any, {
    smtp: {} as any,
    mx: {} as any,
    senderDomain: 'quantmail.in',
    now: () => new Date('2026-10-09T00:00:00Z'),
  });
}

const INTERNAL_USERS = [{ email: 'kundan@quantmail.in', username: 'kundan' }];

beforeEach(() => {
  deliverInternallyMock.mockClear();
  sendViaSesMock.mockClear();
  isSesConfiguredMock.mockClear();
  isSesConfiguredMock.mockReturnValue(true);
});

describe('DeliveryWorker internal delivery (P0: delayed /compose sends)', () => {
  it('delivers to internal recipients via inbox copies and never touches SES', async () => {
    const prisma = makePrisma(makeEmail(), INTERNAL_USERS);
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({
      data: {
        to: 'kundan@quantmail.in',
        subject: 'hello',
        body: 'hi',
        emailId: 'email-1',
        userId: 'user-1',
      },
    });

    // Internal mailbox copy created…
    expect(deliverInternallyMock).toHaveBeenCalledTimes(1);
    expect(deliverInternallyMock.mock.calls[0][0]).toMatchObject({
      fromUserId: 'user-1',
      subject: 'hello',
      toAddresses: ['kundan@quantmail.in'],
      messageId: '<email-1@quantmail.in>',
    });
    // …and SES was never invoked for the internal address.
    expect(sendViaSesMock).not.toHaveBeenCalled();
    // Receipt recorded as sent; email flipped out of draft.
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0]).toMatchObject({
      recipient: 'kundan@quantmail.in',
      status: 'sent',
    });
    expect(result.deliveryStatus).toBe('sent');
  });

  it('splits mixed recipients: internal via inbox, external via SES only', async () => {
    const prisma = makePrisma(
      makeEmail({ toAddresses: ['kundan@quantmail.in', 'friend@gmail.com'] }),
      INTERNAL_USERS,
    );
    const worker = makeWorker(prisma);

    const result = await worker.processDelivery({
      data: {
        to: 'kundan@quantmail.in, friend@gmail.com',
        subject: 'hello',
        body: 'hi',
        emailId: 'email-1',
        userId: 'user-1',
      },
    });

    expect(deliverInternallyMock).toHaveBeenCalledTimes(1);
    expect(deliverInternallyMock.mock.calls[0][0].toAddresses).toEqual(['kundan@quantmail.in']);
    // SES only ever sees the external address — the internal one must not
    // loop out through SES (sandbox / MX-to-inbound loop).
    expect(sendViaSesMock).toHaveBeenCalledTimes(1);
    expect(sendViaSesMock.mock.calls[0][0].to).toEqual(['friend@gmail.com']);
    const byRecipient = Object.fromEntries(result.recipients.map((r: any) => [r.recipient, r.status]));
    expect(byRecipient['kundan@quantmail.in']).toBe('sent');
    expect(byRecipient['friend@gmail.com']).toBe('sent');
  });

  it('all-external recipients skip internal delivery entirely', async () => {
    const prisma = makePrisma(makeEmail({ toAddresses: ['friend@gmail.com'] }), []);
    const worker = makeWorker(prisma);

    await worker.processDelivery({
      data: {
        to: 'friend@gmail.com',
        subject: 'hello',
        body: 'hi',
        emailId: 'email-1',
        userId: 'user-1',
      },
    });

    expect(deliverInternallyMock).not.toHaveBeenCalled();
    expect(sendViaSesMock).toHaveBeenCalledTimes(1);
    expect(sendViaSesMock.mock.calls[0][0].to).toEqual(['friend@gmail.com']);
  });
});
