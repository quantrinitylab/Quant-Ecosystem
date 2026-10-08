import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../services/email.service';

function createMockPrisma() {
  // K1: every mail mutation runs inside `prisma.$transaction`, so the double
  // passes the callback the mock itself as the tx client and records outbox
  // writes on `outboxEvent.create` — same-transaction semantics by construction.
  const mock = {
    email: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      // QM-BACK-002: versionedUpdate's conditional updateMany resolves
      // { count: 1 } by default; conflict tests override per-test.
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
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
    label: {
      findMany: vi.fn(),
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

/**
 * `EmailService.send` prunes suppressed recipients, and with no suppression port
 * injected it falls back to the module-level `suppressionService` singleton,
 * which is bound to the real Prisma client. Mocking `prisma` here therefore did
 * not isolate this suite: `send` reached for a live database and failed with
 * `Environment variable not found: DATABASE_URL`.
 *
 * Injecting the seam the constructor already exposes keeps the suite offline. It
 * allows every recipient, because suppression has its own dedicated tests and
 * this file is about EmailService's own behaviour.
 */
function createAllowAllSuppression() {
  return {
    filterAllowedRecipients: vi.fn().mockImplementation(async (recipients: string[]) => ({
      allowed: recipients,
      suppressed: [],
    })),
  };
}

/**
 * A queue pipeline that always enqueues successfully — used by tests that
 * exercise the Sent flip / timeline stamping (which require a real delivery
 * path). CUST-P0-2: without a pipeline, EmailService.send() now fails
 * honestly with 503 instead of faking a Sent flip, so these tests wire a
 * working queue.
 */
function createWorkingPipeline() {
  return {
    enqueueSend: vi.fn().mockResolvedValue('job-1'),
    cancelSend: vi.fn().mockResolvedValue(undefined),
  };
}

describe('EmailService', () => {
  let service: EmailService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let suppression: ReturnType<typeof createAllowAllSuppression>;

  beforeEach(() => {
    prisma = createMockPrisma();
    suppression = createAllowAllSuppression();
    service = new EmailService(prisma as never, undefined, suppression);
  });

  describe('compose', () => {
    it('creates a draft email', async () => {
      const mockEmail = {
        id: 'email-1',
        userId: 'user-1',
        toAddresses: ['recipient@test.com'],
        ccAddresses: [],
        bccAddresses: [],
        subject: 'Test Subject',
        bodyHtml: '<p>Hello</p>',
        bodyPlain: 'Hello',
        fromAddress: 'user-1@quantchat.online',
        fromName: 'User One',
        isDraft: true,
        threadId: null,
        inReplyTo: null,
        attachments: [],
        createdAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue({
        email: 'user-1@quantchat.online',
        displayName: 'User One',
      });
      prisma.email.create.mockResolvedValue(mockEmail);

      const result = await service.compose({
        userId: 'user-1',
        toAddresses: ['recipient@test.com'],
        subject: 'Test Subject',
        bodyHtml: '<p>Hello</p>',
        bodyPlain: 'Hello',
      });

      expect(result).toEqual(mockEmail);
      expect(result.isDraft).toBe(true);
      // Sender's own QuantMail address is stamped onto the draft.
      expect(prisma.email.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          toAddresses: ['recipient@test.com'],
          ccAddresses: [],
          bccAddresses: [],
          subject: 'Test Subject',
          bodyHtml: '<p>Hello</p>',
          bodyPlain: 'Hello',
          fromAddress: 'user-1@quantchat.online',
          fromName: 'User One',
          isDraft: true,
          threadId: null,
          inReplyTo: null,
          // Derived by `compose` from the attachment list, so composing with none
          // must persist `false` rather than leaving the column unset.
          hasAttachments: false,
          attachments: [],
          // A caller that says nothing is writing a letter. Recorded rather than
          // left to the column default so the row's kind is explicit from the
          // moment it exists.
          messageKind: 'MAIL',
          priority: 'NORMAL',
        },
      });
    });

    it('records a chat message as one', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: 'user-1@quantchat.online',
        displayName: 'User One',
      });
      prisma.email.create.mockResolvedValue({ id: 'email-2' });

      await service.compose({
        userId: 'user-1',
        toAddresses: ['recipient@test.com'],
        subject: 'Re: Design review',
        bodyPlain: 'on my way',
        messageKind: 'CHAT',
      });

      expect(prisma.email.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ messageKind: 'CHAT' }),
        }),
      );
    });
  });

  describe('send', () => {
    it('moves email to sent folder and sets sentAt', async () => {
      const svc = new EmailService(prisma as never, createWorkingPipeline() as never, suppression);
      const mockEmail = {
        id: 'email-1',
        userId: 'user-1',
        isDraft: true,
        toAddresses: ['recipient@test.com'],
        ccAddresses: [],
        bccAddresses: [],
        subject: 'Test Subject',
        bodyPlain: 'Hello',
        bodyHtml: '<p>Hello</p>',
        fromAddress: 'user-1@quantmail.in',
        fromName: 'User One',
      };
      const sentEmail = {
        ...mockEmail,
        isDraft: false,
        isSent: true,
        folderId: 'sent-folder-id',
        sentAt: new Date(),
      };
      // QM-BACK-002: send() flips via versionedUpdate — pre-send read returns
      // the draft, the conditional update's re-read returns the sent row.
      prisma.email.findUnique.mockResolvedValueOnce(mockEmail).mockResolvedValueOnce(sentEmail);

      const result = await svc.send('user-1', 'email-1', 'sent-folder-id');

      expect(result.isSent).toBe(true);
      expect(result.isDraft).toBe(false);
      expect(result.folderId).toBe('sent-folder-id');
      expect(result.sentAt).toBeInstanceOf(Date);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: {
          isDraft: false,
          isSent: true,
          folderId: 'sent-folder-id',
          sentAt: expect.any(Date),
          // Cross-mailbox read receipts: the sender's copy and every recipient
          // copy share one Message-ID so `readAt` can propagate back.
          messageId: '<email-1@quantmail.in>',
          // The sender's own copy needs a position on the inbox timeline, not just
          // a send time: the mailbox list is ordered by `receivedAt`, so a null
          // here is why a message you sent never appeared beside the conversation
          // it belongs to.
          receivedAt: expect.any(Date),
          deliveryStatus: expect.any(String),
          // QM-BACK-002: the send flip bumps the version column.
          version: { increment: 1 },
        },
      });
    });

    it('stamps deliveredAt when delivery completes immediately', async () => {
      // No external recipients and no delay: deliveryStatus lands on 'delivered'
      // synchronously, so the sender's ticks move to double grey at once.
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        isDraft: true,
        toAddresses: [],
        ccAddresses: [],
        bccAddresses: [],
        fromAddress: 'user-1@quantmail.in',
      });

      await service.send('user-1', 'email-1', 'sent-folder-id');

      // QM-BACK-002: the send flip is a conditional updateMany now.
      const { data } = prisma.email.updateMany.mock.calls[0][0];
      expect(data.deliveryStatus).toBe('delivered');
      expect(data.deliveredAt).toEqual(data.sentAt);
    });

    it('fails honestly (503) when no transport can deliver, instead of faking Sent', async () => {
      // CUST-P0-2: external recipient, no queue pipeline, SES not configured.
      // Nothing can deliver the message, so send() must throw a real,
      // retryable error — and must NOT flip the draft to Sent (the old
      // 'deferred'-flip made the UI announce "Message sent" while nothing
      // was ever queued).
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        isDraft: true,
        toAddresses: ['someone@gmail.com'],
        ccAddresses: [],
        bccAddresses: [],
        fromAddress: 'user-1@quantmail.in',
      });
      prisma.email.update.mockResolvedValue({ id: 'email-1' });

      const err = await service
        .send('user-1', 'email-1', 'sent-folder-id')
        .then(
          () => null,
          (e: any) => e,
        );
      expect(err).not.toBeNull();
      expect(err?.statusCode).toBe(503);
      expect(err?.code).toBe('DELIVERY_QUEUE_UNAVAILABLE');
      expect(String(err?.message)).toContain('remains a draft');
      // The draft is never flipped: no Sent row is written.
      expect(prisma.email.update).not.toHaveBeenCalled();
    });

    it('keeps an existing messageId instead of generating one', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        isDraft: true,
        toAddresses: [],
        fromAddress: 'user-1@quantmail.in',
        messageId: '<original@quantmail.in>',
      });
      await service.send('user-1', 'email-1', 'sent-folder-id');

      // QM-BACK-002: the send flip is a conditional updateMany now.
      const { data } = prisma.email.updateMany.mock.calls[0][0];
      // A re-send keeps the same cross-mailbox identity.
      expect(data.messageId).toBe('<original@quantmail.in>');
    });

    it('gives the sent copy the same timeline position as its send time', async () => {
      const svc = new EmailService(prisma as never, createWorkingPipeline() as never, suppression);
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        isDraft: true,
        toAddresses: ['recipient@test.com'],
        fromAddress: 'user-1@quantmail.in',
      });
      await svc.send('user-1', 'email-1', 'sent-folder-id');

      // QM-BACK-002: the send flip is a conditional updateMany now.
      const { data } = prisma.email.updateMany.mock.calls[0][0];
      expect(data.receivedAt).toEqual(data.sentAt);
    });

    it('leaves an existing timeline position alone', async () => {
      const svc = new EmailService(prisma as never, createWorkingPipeline() as never, suppression);
      // A scheduled or re-sent message already has a place in the timeline;
      // overwriting it would move the message to today.
      const original = new Date('2026-08-01T09:00:00Z');
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        isDraft: true,
        toAddresses: ['recipient@test.com'],
        fromAddress: 'user-1@quantmail.in',
        receivedAt: original,
      });
      await svc.send('user-1', 'email-1', 'sent-folder-id');

      // QM-BACK-002: the send flip is a conditional updateMany now.
      const { data } = prisma.email.updateMany.mock.calls[0][0];
      expect(data.receivedAt).toBe(original);
      expect(data.sentAt).not.toBe(original);
    });

    it('throws EMAIL_NOT_FOUND for non-existent email', async () => {
      prisma.email.findUnique.mockResolvedValue(null);

      await expect(service.send('user-1', 'missing', 'sent-folder')).rejects.toThrow(
        'Email not found',
      );
    });

    it('throws FORBIDDEN when user does not own the email', async () => {
      prisma.email.findUnique.mockResolvedValue({ id: 'email-1', userId: 'other-user' });

      await expect(service.send('user-1', 'email-1', 'sent-folder')).rejects.toThrow(
        'Not authorized to send this email',
      );
    });
  });

  describe('receive', () => {
    it('creates an email in the inbox folder', async () => {
      const now = new Date();
      const mockEmail = {
        id: 'email-2',
        userId: 'user-1',
        folderId: 'inbox-folder-id',
        fromAddress: 'sender@test.com',
        fromName: 'Sender',
        toAddresses: ['user@test.com'],
        subject: 'Incoming',
        bodyPlain: 'Hi there',
        isRead: false,
        receivedAt: now,
      };
      prisma.email.create.mockResolvedValue(mockEmail);

      const result = await service.receive({
        userId: 'user-1',
        folderId: 'inbox-folder-id',
        fromAddress: 'sender@test.com',
        fromName: 'Sender',
        toAddresses: ['user@test.com'],
        subject: 'Incoming',
        bodyPlain: 'Hi there',
        receivedAt: now,
      });

      expect(result.folderId).toBe('inbox-folder-id');
      expect(result.isRead).toBe(false);
      expect(result.fromAddress).toBe('sender@test.com');
    });
  });

  describe('moveToFolder', () => {
    it('updates the folderId of an email', async () => {
      prisma.email.findUnique
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', folderId: 'inbox', version: 2 })
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', folderId: 'archive', version: 3 });

      const result = await service.moveToFolder('email-1', 'archive', 'user-1');

      expect(result.folderId).toBe('archive');
      // QM-BACK-002: conditional updateMany bumps the version column.
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { folderId: 'archive', version: { increment: 1 } },
      });
    });

    it('throws FORBIDDEN for unauthorized user', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'other-user',
      });

      await expect(service.moveToFolder('email-1', 'archive', 'user-1')).rejects.toThrow(
        'Not authorized',
      );
    });
  });

  describe('delete', () => {
    it('moves an email to recoverable trash by default', async () => {
      prisma.email.findUnique
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isTrash: false, version: 1 })
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isTrash: true, deletedAt: null, version: 2 });

      const result = await service.delete('email-1', 'user-1');

      expect(result.isTrash).toBe(true);
      expect(result.deletedAt).toBeNull();
      // QM-BACK-002: conditional updateMany bumps the version column.
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { deletedAt: null, isTrash: true, version: { increment: 1 } },
      });
    });

    it('records logical deletion when the hard flag is true', async () => {
      prisma.email.findUnique
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isTrash: true, version: 4 })
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isTrash: true, version: 5 });

      await service.delete('email-1', 'user-1', true);

      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { deletedAt: expect.any(Date), version: { increment: 1 } },
      });
      expect(prisma.email.delete).not.toHaveBeenCalled();
    });

    it('throws EMAIL_NOT_FOUND for non-existent email', async () => {
      prisma.email.findUnique.mockResolvedValue(null);

      await expect(service.delete('missing', 'user-1')).rejects.toThrow('Email not found');
    });
  });

  describe('search', () => {
    it('filters emails by query in subject, body, fromAddress', async () => {
      const emails = [{ id: 'email-1', subject: 'Meeting notes', bodyPlain: 'Content' }];
      prisma.email.findMany.mockResolvedValue(emails);
      prisma.email.count.mockResolvedValue(1);

      const result = await service.search('user-1', 'Meeting');

      expect(result.data).toEqual(emails);
      expect(result.total).toBe(1);
      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            deletedAt: null,
            OR: expect.arrayContaining([
              expect.objectContaining({ subject: { contains: 'Meeting', mode: 'insensitive' } }),
            ]),
          }),
        }),
      );
    });

    it('applies the from filter as a case-insensitive sender match', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      await service.search('user-1', 'hello', {}, { from: 'kundan' });

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({
                    fromAddress: { contains: 'kundan', mode: 'insensitive' },
                  }),
                  expect.objectContaining({
                    fromName: { contains: 'kundan', mode: 'insensitive' },
                  }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it('applies a full-address to filter as an exact recipient element match', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      await service.search('user-1', 'hello', {}, { to: 'friend@example.com' });

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({
                    toAddresses: { array_contains: 'friend@example.com' },
                  }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it('does not filter server-side on a bare to fragment (client matches it)', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      await service.search('user-1', 'hello', {}, { to: 'kundan' });

      const where = prisma.email.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where.AND).toBeUndefined();
      expect(where).not.toHaveProperty('toAddresses');
    });

    it('applies the hasAttachment filter', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      await service.search('user-1', 'hello', {}, { hasAttachment: true });

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ hasAttachments: true }),
        }),
      );
    });

    it('applies the dateFrom filter as a receivedAt lower bound', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      await service.search('user-1', 'hello', {}, { dateFrom: '2026-10-01' });

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            receivedAt: expect.objectContaining({
              gte: new Date('2026-10-01T00:00:00'),
            }),
          }),
        }),
      );
    });

    it('ignores a malformed dateFrom instead of failing the search', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      await service.search('user-1', 'hello', {}, { dateFrom: 'not-a-date' });

      const where = prisma.email.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where).not.toHaveProperty('receivedAt');
    });

    it('resolves a label name to its id for the labels filter', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);
      prisma.label.findMany.mockResolvedValue([{ id: 'label-9', name: 'Work' }]);

      await service.search('user-1', 'hello', {}, { label: 'work' });

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            labels: { array_contains: 'label-9' },
          }),
        }),
      );
    });

    it('matches zero rows when the label name resolves to nothing', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);
      prisma.label.findMany.mockResolvedValue([]);

      await service.search('user-1', 'hello', {}, { label: 'nope' });

      const where = prisma.email.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where).toHaveProperty('labels');
    });

    it('applies the subject filter case-insensitively', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      await service.search('user-1', 'hello', {}, { subject: 'Invoice' });

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                subject: { contains: 'Invoice', mode: 'insensitive' },
              }),
            ]),
          }),
        }),
      );
    });
  });

  describe('markRead', () => {
    it('marks an email as read', async () => {
      prisma.email.findUnique
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isRead: false, version: 1 })
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isRead: true, version: 2 });

      const result = await service.markRead('email-1', 'user-1');

      expect(result.isRead).toBe(true);
    });

    it('stamps readAt and propagates it to the sender sent copy', async () => {
      prisma.email.findUnique
        .mockResolvedValueOnce({
          id: 'email-2',
          userId: 'user-1',
          isRead: false,
          isSent: false,
          messageId: '<m1@quantmail.in>',
          version: 3,
        })
        .mockResolvedValueOnce({ id: 'email-2', userId: 'user-1', isRead: true, version: 4 });
      prisma.email.updateMany.mockResolvedValue({ count: 1 });

      await service.markRead('email-2', 'user-1');

      // QM-BACK-002: the read flip is a conditional updateMany with a version bump.
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: 'email-2' },
        data: { isRead: true, readAt: expect.any(Date), version: { increment: 1 } },
      });
      // The sender's ticks flip to double-green via the shared messageId.
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { messageId: '<m1@quantmail.in>', isSent: true, readAt: null, deletedAt: null },
        data: { readAt: expect.any(Date), version: { increment: 1 } },
      });
    });

    it('skips propagation for the sender reading their own sent copy', async () => {
      prisma.email.findUnique
        .mockResolvedValueOnce({
          id: 'email-3',
          userId: 'user-1',
          isRead: false,
          isSent: true,
          messageId: '<m1@quantmail.in>',
          version: 1,
        })
        .mockResolvedValueOnce({ id: 'email-3', userId: 'user-1', isRead: true, version: 2 });

      await service.markRead('email-3', 'user-1');

      // Only the conditional read flip ran — no propagation updateMany.
      expect(prisma.email.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: 'email-3' },
        data: { isRead: true, readAt: expect.any(Date), version: { increment: 1 } },
      });
    });
  });

  describe('markStarred', () => {
    it('toggles the starred state', async () => {
      prisma.email.findUnique
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isStarred: false, version: 1 })
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isStarred: true, version: 2 });

      const result = await service.markStarred('email-1', 'user-1');

      expect(result.isStarred).toBe(true);
      // QM-BACK-002: conditional updateMany with a version bump.
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { isStarred: true, version: { increment: 1 } },
      });
    });
  });

  describe('togglePin', () => {
    it('toggles the pinned state independently from star', async () => {
      prisma.email.findUnique
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isPinned: false, isStarred: true, version: 1 })
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isPinned: true, isStarred: true, version: 2 });

      const result = await service.togglePin('email-1', 'user-1');

      expect(result.isPinned).toBe(true);
      expect(result.isStarred).toBe(true);
      // QM-BACK-002: conditional updateMany with a version bump.
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { isPinned: true, version: { increment: 1 } },
      });
    });

    it('throws 404 for missing email', async () => {
      prisma.email.findUnique.mockResolvedValue(null);
      await expect(service.togglePin('missing', 'user-1')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws 403 for other user email', async () => {
      prisma.email.findUnique.mockResolvedValue({ id: 'email-1', userId: 'user-2' });
      await expect(service.togglePin('email-1', 'user-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('sendEmail', () => {
    it('composes and sends an email in one call', async () => {
      const svc = new EmailService(prisma as never, createWorkingPipeline() as never, suppression);
      const draftEmail = {
        id: 'email-draft',
        userId: 'user-1',
        isDraft: true,
        toAddresses: ['recipient@test.com'],
        subject: 'Quick Send',
      };
      const sentEmail = {
        ...draftEmail,
        isDraft: false,
        isSent: true,
        folderId: 'sent-folder',
        sentAt: new Date(),
      };
      prisma.email.create.mockResolvedValue(draftEmail);
      // QM-BACK-002: sendEmail composes, then send() flips via versionedUpdate —
      // the compose's ownership read sees the draft, the flip's re-read sees it sent.
      prisma.email.findUnique.mockResolvedValueOnce(draftEmail).mockResolvedValueOnce(sentEmail);

      const result = await svc.sendEmail(
        'user-1',
        { toAddresses: ['recipient@test.com'], subject: 'Quick Send' },
        'sent-folder',
      );

      expect(result.isSent).toBe(true);
      expect(result.isDraft).toBe(false);
      expect(prisma.email.create).toHaveBeenCalled();
      expect(prisma.email.updateMany).toHaveBeenCalled();
    });
  });

  describe('getInbox', () => {
    it('returns emails from inbox folder with pagination', async () => {
      const emails = [{ id: 'email-1', folderId: 'inbox-id' }];
      prisma.email.findMany.mockResolvedValue(emails);
      prisma.email.count.mockResolvedValue(1);

      const result = await service.getInbox('user-1', 'inbox-id', { page: 1, pageSize: 10 });

      expect(result.data).toEqual(emails);
      expect(prisma.email.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', folderId: 'inbox-id', deletedAt: null },
        skip: 0,
        take: 10,
        orderBy: { receivedAt: 'desc' },
      });
    });
  });

  describe('trashEmail', () => {
    it('soft deletes the email (moves to trash)', async () => {
      // QM-BACK-002: delete() flips via versionedUpdate — ownership read, then
      // the conditional update's re-read returns the trashed row.
      prisma.email.findUnique
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isTrash: false, version: 1 })
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isTrash: true, version: 2 });

      const result = await service.trashEmail('email-1', 'user-1');

      expect(result.isTrash).toBe(true);
    });
  });

  describe('starEmail', () => {
    it('toggles starred state on the email', async () => {
      // QM-BACK-002: markStarred() flips via versionedUpdate — ownership read,
      // then the conditional update's re-read returns the starred row.
      prisma.email.findUnique
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isStarred: false, version: 1 })
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', isStarred: true, version: 2 });

      const result = await service.starEmail('email-1', 'user-1');

      expect(result.isStarred).toBe(true);
    });
  });

  describe('searchEmails', () => {
    it('delegates to the search method', async () => {
      const emails = [{ id: 'email-1', subject: 'Important meeting' }];
      prisma.email.findMany.mockResolvedValue(emails);
      prisma.email.count.mockResolvedValue(1);

      const result = await service.searchEmails('user-1', 'Important');

      expect(result.data).toEqual(emails);
      expect(result.total).toBe(1);
    });
  });

  describe('getLabels', () => {
    it('returns all labels for a user', async () => {
      const labels = [
        { id: 'label-1', userId: 'user-1', name: 'Important', color: 'red' },
        { id: 'label-2', userId: 'user-1', name: 'Work', color: 'blue' },
      ];
      prisma.label.findMany.mockResolvedValue(labels);

      const result = await service.getLabels('user-1');

      expect(result).toEqual(labels);
      expect(prisma.label.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('applyLabel', () => {
    it('adds a label to an email', async () => {
      prisma.email.findUnique
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', labels: ['label-1'], version: 1 })
        .mockResolvedValueOnce({ id: 'email-1', userId: 'user-1', labels: ['label-1', 'label-2'], version: 2 });

      const result = await service.applyLabel('email-1', 'label-2', 'user-1');

      expect((result as unknown as { labels: string[] }).labels).toEqual(['label-1', 'label-2']);
      // QM-BACK-002: conditional updateMany with a version bump.
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { labels: ['label-1', 'label-2'], version: { increment: 1 } },
      });
    });

    it('does not duplicate a label already applied', async () => {
      const email = {
        id: 'email-1',
        userId: 'user-1',
        labels: ['label-1'],
      };
      prisma.email.findUnique.mockResolvedValue(email);

      const result = await service.applyLabel('email-1', 'label-1', 'user-1');

      expect(result).toEqual(email);
      expect(prisma.email.update).not.toHaveBeenCalled();
    });

    it('throws EMAIL_NOT_FOUND for missing email', async () => {
      prisma.email.findUnique.mockResolvedValue(null);

      await expect(service.applyLabel('missing', 'label-1', 'user-1')).rejects.toThrow(
        'Email not found',
      );
    });

    it('throws FORBIDDEN when user does not own the email', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'other-user',
        labels: [],
      });

      await expect(service.applyLabel('email-1', 'label-1', 'user-1')).rejects.toThrow(
        'Not authorized',
      );
    });
  });

  describe('batch operations', () => {
    it('batchMarkRead marks multiple emails as read', async () => {
      prisma.email.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.batchMarkRead(['e1', 'e2', 'e3', 'e4', 'e5'], 'user-1', true);
      expect(result.count).toBe(5);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['e1', 'e2', 'e3', 'e4', 'e5'] },
          userId: 'user-1',
          deletedAt: null,
        },
        // QM-BACK-002: bulk writes keep the version column truthful.
        data: { isRead: true, updatedAt: expect.any(Date), version: { increment: 1 } },
      });
    });

    it('batchArchive moves multiple emails to the archive folder', async () => {
      prisma.email.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.batchArchive(['e1', 'e2', 'e3'], 'archive-folder-id', 'user-1');
      expect(result.count).toBe(3);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['e1', 'e2', 'e3'] },
          userId: 'user-1',
          deletedAt: null,
        },
        data: {
          folderId: 'archive-folder-id',
          updatedAt: expect.any(Date),
          version: { increment: 1 },
        },
      });
    });

    it('batchDelete soft deletes multiple emails to trash', async () => {
      prisma.email.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.batchDelete(['e1', 'e2'], 'user-1', false);
      expect(result.count).toBe(2);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['e1', 'e2'] },
          userId: 'user-1',
          deletedAt: null,
        },
        data: { isTrash: true, updatedAt: expect.any(Date), version: { increment: 1 } },
      });
    });

    it('batchDelete hard deletes multiple emails', async () => {
      prisma.email.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.batchDelete(['e1', 'e2'], 'user-1', true);
      expect(result.count).toBe(2);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['e1', 'e2'] },
          userId: 'user-1',
        },
        data: { deletedAt: expect.any(Date), updatedAt: expect.any(Date), version: { increment: 1 } },
      });
    });

    it('batchStar stars multiple emails', async () => {
      prisma.email.updateMany.mockResolvedValue({ count: 4 });

      const result = await service.batchStar(['e1', 'e2', 'e3', 'e4'], 'user-1', true);
      expect(result.count).toBe(4);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['e1', 'e2', 'e3', 'e4'] },
          userId: 'user-1',
          deletedAt: null,
        },
        data: { isStarred: true, updatedAt: expect.any(Date), version: { increment: 1 } },
      });
    });

    it('returns count 0 immediately on empty list without DB calls', async () => {
      const result = await service.batchMarkRead([], 'user-1');
      expect(result.count).toBe(0);
      expect(prisma.email.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe('EmailService.deliverInternally applies recipient filters (P0)', () => {
  function deliverPrisma() {
    const base = createMockPrisma();
    return {
      ...base,
      mailFilter: { findMany: vi.fn() },
      emailFolder: { findFirst: vi.fn().mockResolvedValue({ id: 'inbox-folder' }) },
    };
  }

  const baseInput = {
    fromUserId: 'user-1',
    subject: 'hello',
    bodyPlain: 'hi there',
    toAddresses: ['user-2@quantmail.in'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stars the recipient copy when a matching star filter exists', async () => {
    const prisma = deliverPrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-2', email: 'user-2@quantmail.in', username: 'user2' },
    ]);
    prisma.email.create.mockResolvedValue({ id: 'email-new' });
    // One enabled filter: from contains "user-1" -> star.
    prisma.mailFilter.findMany.mockResolvedValue([
      {
        id: 'filter-1',
        userId: 'user-2',
        enabled: true,
        priority: 0,
        matchAll: true,
        conditions: [{ from: 'user-1' }],
        actions: [{ star: true }],
      },
    ]);
    const service = new EmailService(prisma as never);

    const delivered = await service.deliverInternally(baseInput);

    expect(delivered).toBe(1);
    expect(prisma.email.update).toHaveBeenCalledWith({
      where: { id: 'email-new' },
      data: expect.objectContaining({ isStarred: true }),
    });
  });

  it('leaves the copy untouched when no filter matches', async () => {
    const prisma = deliverPrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-2', email: 'user-2@quantmail.in', username: 'user2' },
    ]);
    prisma.email.create.mockResolvedValue({ id: 'email-new' });
    prisma.mailFilter.findMany.mockResolvedValue([]);
    const service = new EmailService(prisma as never);

    await service.deliverInternally(baseInput);

    expect(prisma.email.update).not.toHaveBeenCalled();
  });

  it('still delivers when filter evaluation throws (best-effort)', async () => {
    const prisma = deliverPrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-2', email: 'user-2@quantmail.in', username: 'user2' },
    ]);
    prisma.email.create.mockResolvedValue({ id: 'email-new' });
    prisma.mailFilter.findMany.mockRejectedValue(new Error('db down'));
    const service = new EmailService(prisma as never);

    const delivered = await service.deliverInternally(baseInput);

    expect(delivered).toBe(1);
  });
});
