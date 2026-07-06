import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../services/email.service';

function createMockPrisma() {
  return {
    email: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    label: {
      findMany: vi.fn(),
    },
  };
}

describe('EmailService', () => {
  let service: EmailService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmailService(prisma as never);
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
          attachments: [],
        },
      });
    });
  });

  describe('send', () => {
    it('moves email to sent folder and sets sentAt', async () => {
      const mockEmail = {
        id: 'email-1',
        userId: 'user-1',
        isDraft: true,
      };
      prisma.email.findUnique.mockResolvedValue(mockEmail);

      const sentEmail = {
        ...mockEmail,
        isDraft: false,
        isSent: true,
        folderId: 'sent-folder-id',
        sentAt: new Date(),
      };
      prisma.email.update.mockResolvedValue(sentEmail);

      const result = await service.send('user-1', 'email-1', 'sent-folder-id');

      expect(result.isSent).toBe(true);
      expect(result.isDraft).toBe(false);
      expect(result.folderId).toBe('sent-folder-id');
      expect(result.sentAt).toBeInstanceOf(Date);
      expect(prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: {
          isDraft: false,
          isSent: true,
          folderId: 'sent-folder-id',
          sentAt: expect.any(Date),
        },
      });
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
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        folderId: 'inbox',
      });
      prisma.email.update.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        folderId: 'archive',
      });

      const result = await service.moveToFolder('email-1', 'archive', 'user-1');

      expect(result.folderId).toBe('archive');
      expect(prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { folderId: 'archive' },
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
    it('soft deletes an email by default', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
      });
      prisma.email.update.mockResolvedValue({
        id: 'email-1',
        deletedAt: new Date(),
        isTrash: true,
      });

      const result = await service.delete('email-1', 'user-1');

      expect(result.isTrash).toBe(true);
      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { deletedAt: expect.any(Date), isTrash: true },
      });
    });

    it('hard deletes when hard flag is true', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
      });
      prisma.email.delete.mockResolvedValue({ id: 'email-1' });

      await service.delete('email-1', 'user-1', true);

      expect(prisma.email.delete).toHaveBeenCalledWith({ where: { id: 'email-1' } });
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
  });

  describe('markRead', () => {
    it('marks an email as read', async () => {
      prisma.email.findUnique.mockResolvedValue({ id: 'email-1', userId: 'user-1', isRead: false });
      prisma.email.update.mockResolvedValue({ id: 'email-1', isRead: true });

      const result = await service.markRead('email-1', 'user-1');

      expect(result.isRead).toBe(true);
    });
  });

  describe('markStarred', () => {
    it('toggles the starred state', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        isStarred: false,
      });
      prisma.email.update.mockResolvedValue({ id: 'email-1', isStarred: true });

      const result = await service.markStarred('email-1', 'user-1');

      expect(result.isStarred).toBe(true);
      expect(prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { isStarred: true },
      });
    });
  });

  describe('sendEmail', () => {
    it('composes and sends an email in one call', async () => {
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
      prisma.email.findUnique.mockResolvedValue(draftEmail);
      prisma.email.update.mockResolvedValue(sentEmail);

      const result = await service.sendEmail(
        'user-1',
        { toAddresses: ['recipient@test.com'], subject: 'Quick Send' },
        'sent-folder',
      );

      expect(result.isSent).toBe(true);
      expect(result.isDraft).toBe(false);
      expect(prisma.email.create).toHaveBeenCalled();
      expect(prisma.email.update).toHaveBeenCalled();
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
      prisma.email.findUnique.mockResolvedValue({ id: 'email-1', userId: 'user-1' });
      prisma.email.update.mockResolvedValue({
        id: 'email-1',
        isTrash: true,
        deletedAt: new Date(),
      });

      const result = await service.trashEmail('email-1', 'user-1');

      expect(result.isTrash).toBe(true);
    });
  });

  describe('starEmail', () => {
    it('toggles starred state on the email', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        isStarred: false,
      });
      prisma.email.update.mockResolvedValue({ id: 'email-1', isStarred: true });

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
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        labels: ['label-1'],
      });
      prisma.email.update.mockResolvedValue({
        id: 'email-1',
        labels: ['label-1', 'label-2'],
      });

      const result = await service.applyLabel('email-1', 'label-2', 'user-1');

      expect((result as unknown as { labels: string[] }).labels).toEqual(['label-1', 'label-2']);
      expect(prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { labels: ['label-1', 'label-2'] },
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
});
