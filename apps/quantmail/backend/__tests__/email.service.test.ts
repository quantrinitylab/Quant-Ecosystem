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
        fromAddress: '',
        isDraft: true,
        threadId: null,
        inReplyTo: null,
        attachments: [],
        createdAt: new Date(),
      };
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
      expect(prisma.email.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          toAddresses: ['recipient@test.com'],
          ccAddresses: [],
          bccAddresses: [],
          subject: 'Test Subject',
          bodyHtml: '<p>Hello</p>',
          bodyPlain: 'Hello',
          fromAddress: '',
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
});
