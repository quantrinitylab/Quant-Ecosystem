// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../services/email.service';
import { DeliveryWorker, type SmtpDeliveryParams } from '../services/delivery-worker.service';
import { isSesConfigured, sendViaSes } from '../lib/ses-sender';

vi.mock('../lib/ses-sender', () => ({
  isSesConfigured: vi.fn(() => false),
  sendViaSes: vi.fn(async () => 'test-provider-id'),
}));
vi.mock('../services/thread.service', () => ({
  ThreadService: class {
    async stitchInbound() {
      return 'recipient-thread';
    }
  },
}));
vi.mock('@quant/queue', () => ({ createTypedWorker: vi.fn(), SendEmailJobSchema: {} }));
vi.mock('../services/outbound-delivery.service', () => ({
  OUTBOUND_DELIVERY_QUEUE: 'outbound-delivery',
}));

function fixture(overrides: Record<string, unknown> = {}) {
  const email = {
    id: 'email-fixture',
    userId: 'sender',
    fromAddress: 'sender@quantmail.in',
    fromName: 'Sender',
    subject: 'Mailbox fixture',
    bodyPlain: 'Hello',
    bodyHtml: '<p>Hello</p>',
    toAddresses: ['to@example.invalid'],
    ccAddresses: ['cc@example.invalid'],
    bccAddresses: ['bcc@example.invalid'],
    messageId: '<fixture@quantmail.in>',
    deliveryStatus: 'queued',
    isDraft: true,
    isSent: false,
    ...overrides,
  };
  const attempts = new Map<string, Record<string, unknown>>();
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({
        email: 'sender@quantmail.in',
        displayName: 'Sender',
        username: 'sender',
      })),
      findMany: vi.fn().mockResolvedValue([]),
    },
    emailFolder: { findFirst: vi.fn(async () => ({ id: 'recipient-inbox' })) },
    email: {
      findUnique: vi.fn(async () => email),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'received-copy',
        ...data,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...email, ...data })),
    },
    deliveryAttempt: {
      findUnique: vi.fn(
        async ({ where }: { where: { emailId_recipient: { recipient: string } } }) =>
          attempts.get(where.emailId_recipient.recipient) ?? null,
      ),
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: Record<string, unknown> & { recipient: string };
          update: Record<string, unknown>;
        }) => {
          const row = { ...(attempts.get(create.recipient) ?? create), ...update };
          attempts.set(create.recipient, row);
          return row;
        },
      ),
    },
  };
  const signMessage = vi.fn((_headers: Record<string, string>, _body: string) => 'signed-fixture');
  const auth = { getDkimSigner: vi.fn(async () => ({ signMessage })) };
  const deps = {
    now: () => new Date('2026-09-08T12:00:00Z'),
    mx: { resolveMx: vi.fn(async () => [{ exchange: 'mx.example.invalid', priority: 10 }]) },
    smtp: {
      send: vi.fn(async (_params: SmtpDeliveryParams) => ({
        outcome: 'accepted' as const,
        response: '250 fixture accepted',
      })),
    },
  };
  return { email, prisma, signMessage, auth, deps };
}

describe('mail recipient delivery contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSesConfigured).mockReturnValue(false);
  });

  it('uses the real emailFolder delegate for an internal inbox copy', async () => {
    const { prisma } = fixture();
    prisma.user.findMany.mockResolvedValue([
      { id: 'local-user', email: 'local@quantmail.in', username: 'local' },
    ]);
    const service = new EmailService(prisma as never);
    expect(
      await service.deliverInternally({
        fromUserId: 'sender',
        subject: 'Hello',
        toAddresses: ['local@quantmail.in'],
        bccAddresses: ['other@example.invalid'],
        messageKind: 'CHAT',
      }),
    ).toBe(1);
    expect(prisma.emailFolder.findFirst).toHaveBeenCalledWith({
      where: { userId: 'local-user', type: 'INBOX' },
    });
    expect(prisma.email.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'local-user',
        folderId: 'recipient-inbox',
        bccAddresses: [],
        messageKind: 'CHAT',
      }),
    });
  });

  it('leaves an external-only envelope entirely to outbound transport', async () => {
    const { prisma } = fixture();
    const service = new EmailService(prisma as never);
    expect(
      await service.deliverInternally({
        fromUserId: 'sender',
        subject: 'Hello',
        toAddresses: ['to@example.invalid'],
      }),
    ).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.email.create).not.toHaveBeenCalled();
  });

  it('keeps direct SES roles separate while omitting resolved local aliases', async () => {
    vi.mocked(isSesConfigured).mockReturnValue(true);
    const { prisma } = fixture({ toAddresses: ['to@example.invalid', 'local@quantchat.online'] });
    prisma.user.findMany.mockResolvedValue([
      { id: 'local-user', email: 'local@quantmail.in', username: 'local' },
    ]);
    await new EmailService(prisma as never).send('sender', 'email-fixture', 'sent-folder');
    expect(sendViaSes).toHaveBeenCalledTimes(1);
    expect(sendViaSes).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['to@example.invalid'],
        cc: ['cc@example.invalid'],
        bcc: ['bcc@example.invalid'],
      }),
    );
  });

  it('signs only visible recipient headers while delivering the complete envelope', async () => {
    const { prisma, signMessage, auth, deps } = fixture();
    const receipt = await new DeliveryWorker(prisma as never, auth as never, deps).processDelivery({
      data: { emailId: 'email-fixture' } as never,
    });
    const headers = signMessage.mock.calls[0]?.[0];
    expect(headers).toEqual(
      expect.objectContaining({ to: 'to@example.invalid', cc: 'cc@example.invalid' }),
    );
    expect(headers).not.toHaveProperty('bcc');
    expect(JSON.stringify(headers)).not.toContain('bcc@example.invalid');
    expect(deps.smtp.send.mock.calls.map(([params]) => params.recipient)).toEqual([
      'to@example.invalid',
      'cc@example.invalid',
      'bcc@example.invalid',
    ]);
    expect(receipt.recipients).toHaveLength(3);
  });

  it('keeps worker SES recipients in their original roles', async () => {
    vi.mocked(isSesConfigured).mockReturnValue(true);
    const { prisma, auth, deps } = fixture();
    await new DeliveryWorker(prisma as never, auth as never, deps).processDelivery({
      data: { emailId: 'email-fixture' } as never,
    });
    expect(sendViaSes).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ to: ['to@example.invalid'], cc: [], bcc: [] }),
    );
    expect(sendViaSes).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: [], cc: ['cc@example.invalid'], bcc: [] }),
    );
    expect(sendViaSes).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ to: [], cc: [], bcc: ['bcc@example.invalid'] }),
    );
    expect(deps.smtp.send).not.toHaveBeenCalled();
  });

  it('supports a blind-only worker envelope without visible recipients', async () => {
    vi.mocked(isSesConfigured).mockReturnValue(true);
    const { prisma, auth, deps } = fixture({ toAddresses: [], ccAddresses: [] });
    await new DeliveryWorker(prisma as never, auth as never, deps).processDelivery({
      data: { emailId: 'email-fixture' } as never,
    });
    expect(sendViaSes).toHaveBeenCalledTimes(1);
    expect(sendViaSes).toHaveBeenCalledWith(
      expect.objectContaining({ to: [], cc: [], bcc: ['bcc@example.invalid'] }),
    );
  });
});
