import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../services/email.service';
import { FolderService } from '../services/folder.service';
import { AttachmentService } from '../services/attachment.service';

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
    emailFolder: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
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

describe('Integration: Email Flows', () => {
  let emailService: EmailService;
  let folderService: FolderService;
  let attachmentService: AttachmentService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    emailService = new EmailService(prisma as never);
    folderService = new FolderService(prisma as never);
    attachmentService = new AttachmentService();
  });

  describe('New User Onboarding Flow', () => {
    it('initializes folders then receives first email', async () => {
      prisma.emailFolder.findMany.mockResolvedValue([]);
      let idx = 0;
      prisma.emailFolder.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          idx++;
          return { id: `folder-${idx}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        },
      );

      const folders = await folderService.initializeDefaultFolders('new-user');
      expect(folders).toHaveLength(6);

      const inboxFolder = folders.find((f) => f.type === 'INBOX');
      expect(inboxFolder).toBeTruthy();

      const welcomeEmail = {
        id: 'welcome-1',
        userId: 'new-user',
        folderId: inboxFolder!.id,
        fromAddress: 'welcome@quantmail.com',
        fromName: 'QuantMail Team',
        toAddresses: ['new-user@test.com'],
        subject: 'Welcome to QuantMail!',
        bodyPlain: 'Thanks for signing up.',
        isRead: false,
        receivedAt: new Date(),
      };
      prisma.email.create.mockResolvedValue(welcomeEmail);

      const received = await emailService.receive({
        userId: 'new-user',
        folderId: inboxFolder!.id as string,
        fromAddress: 'welcome@quantmail.com',
        fromName: 'QuantMail Team',
        toAddresses: ['new-user@test.com'],
        subject: 'Welcome to QuantMail!',
        bodyPlain: 'Thanks for signing up.',
      });

      expect(received.folderId).toBe(inboxFolder!.id);
      expect(received.isRead).toBe(false);
    });
  });

  describe('Compose, Send, and Archive Flow', () => {
    it('composes draft, sends, then archives the reply', async () => {
      const draft = {
        id: 'draft-1',
        userId: 'user-1',
        toAddresses: ['bob@test.com'],
        ccAddresses: [],
        bccAddresses: [],
        subject: 'Meeting Tomorrow',
        bodyHtml: '<p>Can we meet at 3pm?</p>',
        bodyPlain: 'Can we meet at 3pm?',
        fromAddress: '',
        isDraft: true,
        isSent: false,
        threadId: null,
        inReplyTo: null,
        attachments: [],
      };
      prisma.email.create.mockResolvedValue(draft);

      const composed = await emailService.compose({
        userId: 'user-1',
        toAddresses: ['bob@test.com'],
        subject: 'Meeting Tomorrow',
        bodyHtml: '<p>Can we meet at 3pm?</p>',
        bodyPlain: 'Can we meet at 3pm?',
      });
      expect(composed.isDraft).toBe(true);

      prisma.email.findUnique.mockResolvedValue(composed);
      const sentEmail = {
        ...composed,
        isDraft: false,
        isSent: true,
        folderId: 'sent',
        sentAt: new Date(),
      };
      prisma.email.update.mockResolvedValue(sentEmail);

      const sent = await emailService.send('user-1', composed.id, 'sent');
      expect(sent.isSent).toBe(true);

      const reply = {
        id: 'reply-1',
        userId: 'user-1',
        fromAddress: 'bob@test.com',
        fromName: 'Bob',
        toAddresses: ['user-1@test.com'],
        subject: 'Re: Meeting Tomorrow',
        bodyPlain: 'Sure, 3pm works!',
        folderId: 'inbox',
        isRead: false,
        receivedAt: new Date(),
        threadId: 'thread-1',
        inReplyTo: 'draft-1',
      };
      prisma.email.create.mockResolvedValue(reply);

      const receivedReply = await emailService.receive({
        userId: 'user-1',
        folderId: 'inbox',
        fromAddress: 'bob@test.com',
        fromName: 'Bob',
        toAddresses: ['user-1@test.com'],
        subject: 'Re: Meeting Tomorrow',
        bodyPlain: 'Sure, 3pm works!',
        threadId: 'thread-1',
        inReplyTo: 'draft-1',
      });

      prisma.email.findUnique.mockResolvedValue(receivedReply);
      prisma.email.update.mockResolvedValue({ ...receivedReply, isRead: true });
      const readReply = await emailService.markRead(receivedReply.id, 'user-1');
      expect(readReply.isRead).toBe(true);

      prisma.email.findUnique.mockResolvedValue(readReply);
      prisma.email.update.mockResolvedValue({ ...readReply, folderId: 'archive' });
      const archived = await emailService.moveToFolder(readReply.id, 'archive', 'user-1');
      expect(archived.folderId).toBe('archive');
    });
  });

  describe('Attachment Upload and Email with Attachment', () => {
    it('generates upload URL and composes email with attachment', async () => {
      const uploadResult = await attachmentService.generateUploadUrl(
        'user-1',
        'report.pdf',
        'application/pdf',
        102400,
      );
      expect(uploadResult.attachmentId).toBeTruthy();
      expect(uploadResult.uploadUrl).toContain('quantmail-attachments');
      expect(uploadResult.expiresAt).toBeInstanceOf(Date);

      const attachment = {
        id: uploadResult.attachmentId,
        filename: 'report.pdf',
        contentType: 'application/pdf',
        size: 102400,
      };

      const draftWithAttachment = {
        id: 'email-att',
        userId: 'user-1',
        toAddresses: ['manager@company.com'],
        ccAddresses: [],
        bccAddresses: [],
        subject: 'Monthly Report',
        bodyHtml: '<p>Please find the report attached.</p>',
        bodyPlain: 'Please find the report attached.',
        fromAddress: '',
        isDraft: true,
        threadId: null,
        inReplyTo: null,
        attachments: [attachment],
        hasAttachments: true,
      };
      prisma.email.create.mockResolvedValue(draftWithAttachment);

      const composed = await emailService.compose({
        userId: 'user-1',
        toAddresses: ['manager@company.com'],
        subject: 'Monthly Report',
        bodyHtml: '<p>Please find the report attached.</p>',
        bodyPlain: 'Please find the report attached.',
        attachments: [attachment],
      });

      expect(composed.attachments).toHaveLength(1);
      expect((composed.attachments as unknown[])[0]).toEqual(attachment);
    });

    it('rejects oversized attachments', async () => {
      await expect(
        attachmentService.generateUploadUrl(
          'user-1',
          'huge.zip',
          'application/zip',
          30 * 1024 * 1024,
        ),
      ).rejects.toThrow('exceeds maximum');
    });

    it('rejects zero-size attachments', async () => {
      await expect(
        attachmentService.generateUploadUrl('user-1', 'empty.txt', 'text/plain', 0),
      ).rejects.toThrow('greater than 0');
    });

    it('rejects empty filename', async () => {
      await expect(
        attachmentService.generateUploadUrl('user-1', '', 'text/plain', 1024),
      ).rejects.toThrow('Filename is required');
    });
  });

  describe('Email Organization with Labels and Stars', () => {
    it('stars an email, applies labels, then moves to custom folder', async () => {
      const email = {
        id: 'email-1',
        userId: 'user-1',
        isStarred: false,
        labels: [],
        folderId: 'inbox',
      };

      prisma.email.findUnique.mockResolvedValue(email);
      prisma.email.update.mockResolvedValue({ ...email, isStarred: true });
      const starred = await emailService.markStarred('email-1', 'user-1');
      expect(starred.isStarred).toBe(true);

      prisma.email.findUnique.mockResolvedValue(starred);
      prisma.email.update.mockResolvedValue({ ...starred, labels: ['important'] });
      const labeled = await emailService.applyLabel('email-1', 'important', 'user-1');
      expect((labeled as unknown as { labels: string[] }).labels).toContain('important');

      prisma.email.findUnique.mockResolvedValue(labeled);
      prisma.email.update.mockResolvedValue({ ...labeled, folderId: 'custom-folder' });
      const moved = await emailService.moveToFolder('email-1', 'custom-folder', 'user-1');
      expect(moved.folderId).toBe('custom-folder');
    });
  });

  describe('Trash and Recovery Flow', () => {
    it('soft deletes email, then can find it in trash', async () => {
      const email = { id: 'email-1', userId: 'user-1', folderId: 'inbox', isTrash: false };
      prisma.email.findUnique.mockResolvedValue(email);
      prisma.email.update.mockResolvedValue({ ...email, isTrash: true, deletedAt: new Date() });

      const trashed = await emailService.trashEmail('email-1', 'user-1');
      expect(trashed.isTrash).toBe(true);

      const trashEmails = [{ ...trashed }];
      prisma.email.findMany.mockResolvedValue(trashEmails);
      prisma.email.count.mockResolvedValue(1);

      const result = await emailService.listByFolder('user-1', 'trash-folder');
      expect(result.data).toHaveLength(1);
    });

    it('hard deletes email permanently', async () => {
      const email = { id: 'email-1', userId: 'user-1', isTrash: true };
      prisma.email.findUnique.mockResolvedValue(email);
      prisma.email.delete.mockResolvedValue(email);

      await emailService.delete('email-1', 'user-1', true);
      expect(prisma.email.delete).toHaveBeenCalledWith({ where: { id: 'email-1' } });
    });
  });

  describe('Search and Filter Integration', () => {
    it('searches within a specific folder', async () => {
      const results = [{ id: 'e-1', subject: 'Budget Q4', folderId: 'inbox' }];
      prisma.email.findMany.mockResolvedValue(results);
      prisma.email.count.mockResolvedValue(1);

      const searchResult = await emailService.search('user-1', 'Budget');
      expect(searchResult.data).toHaveLength(1);
      expect(searchResult.data[0].subject).toContain('Budget');
    });

    it('inbox listing excludes deleted emails', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      await emailService.getInbox('user-1', 'inbox-folder');

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });
  });

  describe('Concurrent Operations', () => {
    it('handles multiple label applications without duplication', async () => {
      const email = { id: 'email-1', userId: 'user-1', labels: [] };

      prisma.email.findUnique.mockResolvedValue(email);
      prisma.email.update.mockResolvedValue({ ...email, labels: ['label-a'] });
      await emailService.applyLabel('email-1', 'label-a', 'user-1');

      prisma.email.findUnique.mockResolvedValue({ ...email, labels: ['label-a'] });
      prisma.email.update.mockResolvedValue({ ...email, labels: ['label-a', 'label-b'] });
      await emailService.applyLabel('email-1', 'label-b', 'user-1');

      prisma.email.findUnique.mockResolvedValue({ ...email, labels: ['label-a', 'label-b'] });
      const result = await emailService.applyLabel('email-1', 'label-a', 'user-1');
      expect(prisma.email.update).toHaveBeenCalledTimes(2);
    });
  });
});
