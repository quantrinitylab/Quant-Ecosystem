import { describe, it, expect, beforeEach, vi } from 'vitest';

// Control the SES boundary: configured, but the transmit outcome is ours.
const ses = vi.hoisted(() => ({
  isSesConfigured: vi.fn(() => true),
  sendViaSes: vi.fn(),
}));
vi.mock('../lib/ses-sender', () => ses);

// deliverInternally copies QuantDrive picks per recipient; the Drive read itself is stubbed.
const drive = vi.hoisted(() => ({
  plaintext: vi.fn(async (_row: unknown) => Buffer.from('%PDF-1.7 from drive')),
}));
vi.mock('../services/drive-storage.service', () => ({
  checkedPlaintext: drive.plaintext,
}));

import { EmailService } from '../services/email.service';
import { RemoteCallTimeoutError } from '@quant/server-core';

/**
 * fix/qm-stuck-send-reconciler — provider-accepted-but-response-lost.
 *
 * The direct-SES fallback runs when the queue pipeline exists but the enqueue
 * threw (e.g. queue-accept-then-timeout). When SES itself times out, the
 * transmit MAY have been accepted: that is an UNKNOWN outcome, not a
 * definitive failure. It must be preserved honestly as deliveryStatus
 * 'unknown' — never silently re-fired as 'deferred' (duplicate send), never
 * marked 'delivered'.
 */

function createMockPrisma() {
  const mock = {
    email: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user-1@quantmail.in',
        username: 'user1',
        displayName: 'User One',
      }),
    },
    outboxEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'outbox-1',
        ...args.data,
      })),
    },
    $transaction: null as unknown as ReturnType<typeof vi.fn>,
  };
  mock.$transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock));
  return mock;
}

function createAllowAllSuppression() {
  return {
    filterAllowedRecipients: vi.fn().mockImplementation(async (recipients: string[]) => ({
      allowed: recipients,
      suppressed: [],
    })),
  };
}

/** Pipeline whose enqueue always throws — forces the direct-SES fallback path. */
function createDeadPipeline() {
  return {
    enqueueSend: vi.fn().mockRejectedValue(new Error('redis unreachable')),
    cancelSend: vi.fn(),
  };
}

function makeDraft() {
  return {
    id: 'email-1',
    userId: 'user-1',
    isDraft: true,
    isSent: false,
    toAddresses: ['someone@gmail.com'],
    ccAddresses: [],
    bccAddresses: [],
    subject: 'Hello',
    bodyPlain: 'Hi',
    bodyHtml: '',
    fromAddress: 'user-1@quantmail.in',
    fromName: 'User One',
    attachments: [],
  };
}

function makeFlipped(draft: Record<string, unknown>) {
  return {
    ...draft,
    isDraft: false,
    isSent: true,
    deliveryStatus: 'queued',
    version: 1,
    threadId: null,
    sentAt: new Date(),
  };
}

describe('EmailService.send — SES transmit timeout becomes deliveryStatus unknown (not deferred, not delivered)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    ses.isSesConfigured.mockReturnValue(true);
    ses.sendViaSes.mockReset();
  });

  it("marks 'unknown' when the SES transmit times out (outcome uncertain)", async () => {
    const draft = makeDraft();
    const flipped = makeFlipped(draft);
    prisma.email.findUnique.mockResolvedValueOnce(draft).mockResolvedValue(flipped);
    ses.sendViaSes.mockRejectedValue(new RemoteCallTimeoutError('ses', 10_000));

    const svc = new EmailService(
      prisma as never,
      createDeadPipeline() as never,
      createAllowAllSuppression(),
    );
    await svc.send('user-1', 'email-1', 'sent-folder-id');

    // The finalize wrote 'unknown', not 'deferred'.
    const finalizeCall = prisma.email.updateMany.mock.calls.find(
      (call) => (call[0] as { data: { deliveryStatus?: string } }).data.deliveryStatus === 'unknown',
    );
    expect(finalizeCall).toBeDefined();

    // The outbox event reuses the spec'd deferred name (no invented names) but
    // marks the outcome honestly in the payload.
    const outboxCalls = prisma.outboxEvent.create.mock.calls.map((c) => c[0].data);
    const unknownEvent = outboxCalls.find(
      (d) => (d.payload as Record<string, unknown>).deliveryStatus === 'unknown',
    );
    expect(unknownEvent).toMatchObject({
      eventType: 'mail.outbound.deferred.v1',
      aggregateId: 'email-1',
      payload: expect.objectContaining({
        deliveryStatus: 'unknown',
        outcome: 'unknown',
        error: expect.stringContaining('ses'),
      }),
    });
  });

  it("still marks 'deferred' on a definitive SES failure (existing behavior preserved)", async () => {
    const draft = makeDraft();
    const flipped = makeFlipped(draft);
    prisma.email.findUnique.mockResolvedValueOnce(draft).mockResolvedValue(flipped);
    ses.sendViaSes.mockRejectedValue(new Error('MessageRejected: bad address'));

    const svc = new EmailService(
      prisma as never,
      createDeadPipeline() as never,
      createAllowAllSuppression(),
    );
    await svc.send('user-1', 'email-1', 'sent-folder-id');

    const finalizeCall = prisma.email.updateMany.mock.calls.find(
      (call) => (call[0] as { data: { deliveryStatus?: string } }).data.deliveryStatus === 'deferred',
    );
    expect(finalizeCall).toBeDefined();

    // No 'unknown' anywhere on the definitive-failure path.
    const outboxCalls = prisma.outboxEvent.create.mock.calls.map((c) => c[0].data);
    expect(
      outboxCalls.some(
        (d) => (d.payload as Record<string, unknown>).deliveryStatus === 'unknown',
      ),
    ).toBe(false);
  });
});
