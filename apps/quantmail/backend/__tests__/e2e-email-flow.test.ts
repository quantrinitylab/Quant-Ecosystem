import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../services/email.service';
import { FolderService } from '../services/folder.service';

function createMockPrisma() {
  return {
    user: {
      // EmailService.compose stamps the sender's own address on the message.
      findUnique: vi.fn().mockResolvedValue({ email: 'alice@test.com', displayName: 'Alice' }),
    },
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
    label: {
      findMany: vi.fn(),
    },
  };
}

describe('E2E Email Flow', () => {
  let emailService: EmailService;
  let folderService: FolderService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    emailService = new EmailService(prisma as never);
    folderService = new FolderService(prisma as never);
  });

  describe('Full Email Lifecycle', () => {
    it('compose -> send -> receive -> read -> archive -> delete', async () => {
      const draftEmail = {
        id: 'email-1',
        userId: 'user-1',
        toAddresses: ['bob@test.com'],
        ccAddresses: [],
        bccAddresses: [],
        subject: 'Project Update',
        bodyHtml: '<p>Here is the update</p>',
        bodyPlain: 'Here is the update',
        fromAddress: 'alice@test.com',
        isDraft: true,
        isSent: false,
        threadId: null,
        inReplyTo: null,
        attachments: [],
        folderId: null,
        createdAt: new Date(),
      };

      prisma.email.create.mockResolvedValue(draftEmail);
      const composed = await emailService.compose({
        userId: 'user-1',
        toAddresses: ['bob@test.com'],
        subject: 'Project Update',
        bodyHtml: '<p>Here is the update</p>',
        bodyPlain: 'Here is the update',
      });
      expect(composed.isDraft).toBe(true);
      expect(composed.id).toBe('email-1');

      prisma.email.findUnique.mockResolvedValue(composed);
      const sentEmail = {
        ...composed,
        isDraft: false,
        isSent: true,
        folderId: 'sent-folder',
        sentAt: new Date(),
      };
      prisma.email.update.mockResolvedValue(sentEmail);
      const sent = await emailService.send('user-1', composed.id, 'sent-folder');
      expect(sent.isSent).toBe(true);
      expect(sent.isDraft).toBe(false);

      const receivedEmail = {
        id: 'email-2',
        userId: 'user-2',
        fromAddress: 'alice@test.com',
        fromName: 'Alice',
        toAddresses: ['bob@test.com'],
        subject: 'Project Update',
        bodyPlain: 'Here is the update',
        folderId: 'inbox-folder',
        isRead: false,
        receivedAt: new Date(),
      };
      prisma.email.create.mockResolvedValue(receivedEmail);
      const received = await emailService.receive({
        userId: 'user-2',
        folderId: 'inbox-folder',
        fromAddress: 'alice@test.com',
        fromName: 'Alice',
        toAddresses: ['bob@test.com'],
        subject: 'Project Update',
        bodyPlain: 'Here is the update',
      });
      expect(received.isRead).toBe(false);

      prisma.email.findUnique.mockResolvedValue(received);
      const readEmail = { ...received, isRead: true };
      prisma.email.update.mockResolvedValue(readEmail);
      const read = await emailService.markRead(received.id, 'user-2');
      expect(read.isRead).toBe(true);

      prisma.email.findUnique.mockResolvedValue(readEmail);
      const archivedEmail = { ...readEmail, folderId: 'archive-folder' };
      prisma.email.update.mockResolvedValue(archivedEmail);
      const archived = await emailService.moveToFolder(read.id, 'archive-folder', 'user-2');
      expect(archived.folderId).toBe('archive-folder');

      prisma.email.findUnique.mockResolvedValue(archivedEmail);
      const deletedEmail = { ...archivedEmail, deletedAt: new Date(), isTrash: true };
      prisma.email.update.mockResolvedValue(deletedEmail);
      const deleted = await emailService.delete(archived.id, 'user-2');
      expect(deleted.isTrash).toBe(true);
      expect(deleted.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('Send and Receive with Attachments', () => {
    it('sends email with attachment metadata', async () => {
      const attachment = {
        id: 'att-1',
        filename: 'report.pdf',
        size: 102400,
        mimeType: 'application/pdf',
      };
      const draftWithEmail = {
        id: 'email-att',
        userId: 'user-1',
        toAddresses: ['bob@test.com'],
        ccAddresses: [],
        bccAddresses: [],
        subject: 'Report Attached',
        bodyHtml: '<p>See attached</p>',
        bodyPlain: 'See attached',
        fromAddress: '',
        isDraft: true,
        threadId: null,
        inReplyTo: null,
        attachments: [attachment],
        hasAttachments: true,
      };

      prisma.email.create.mockResolvedValue(draftWithEmail);
      const composed = await emailService.compose({
        userId: 'user-1',
        toAddresses: ['bob@test.com'],
        subject: 'Report Attached',
        bodyHtml: '<p>See attached</p>',
        bodyPlain: 'See attached',
        attachments: [attachment],
      });

      expect(composed.attachments).toHaveLength(1);
      expect((composed.attachments as unknown[])[0]).toEqual(attachment);
    });
  });

  describe('Reply and Forward Flow', () => {
    it('composes a reply with threadId and inReplyTo set', async () => {
      const replyDraft = {
        id: 'email-reply',
        userId: 'user-1',
        toAddresses: ['alice@test.com'],
        ccAddresses: [],
        bccAddresses: [],
        subject: 'Re: Project Update',
        bodyHtml: '<p>Thanks for the update</p>',
        bodyPlain: 'Thanks for the update',
        fromAddress: '',
        isDraft: true,
        threadId: 'thread-1',
        inReplyTo: 'email-original',
        attachments: [],
      };

      prisma.email.create.mockResolvedValue(replyDraft);
      const reply = await emailService.compose({
        userId: 'user-1',
        toAddresses: ['alice@test.com'],
        subject: 'Re: Project Update',
        bodyHtml: '<p>Thanks for the update</p>',
        bodyPlain: 'Thanks for the update',
        threadId: 'thread-1',
        inReplyTo: 'email-original',
      });

      expect(reply.threadId).toBe('thread-1');
      expect(reply.inReplyTo).toBe('email-original');
      expect(reply.subject).toBe('Re: Project Update');
    });
  });

  describe('Folder-based Email Organization', () => {
    it('initializes default folders and moves email between them', async () => {
      prisma.emailFolder.findMany.mockResolvedValue([]);
      let callIdx = 0;
      prisma.emailFolder.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          callIdx++;
          return { id: `folder-${callIdx}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        },
      );

      const folders = await folderService.initializeDefaultFolders('user-1');
      expect(folders).toHaveLength(6);
      const inboxFolder = folders.find((f) => f.name === 'Inbox');
      const archiveFolder = folders.find((f) => f.name === 'Archive');
      expect(inboxFolder).toBeTruthy();
      expect(archiveFolder).toBeTruthy();

      const email = { id: 'email-1', userId: 'user-1', folderId: inboxFolder!.id };
      prisma.email.findUnique.mockResolvedValue(email);
      const moved = { ...email, folderId: archiveFolder!.id };
      prisma.email.update.mockResolvedValue(moved);

      const result = await emailService.moveToFolder(
        'email-1',
        archiveFolder!.id as string,
        'user-1',
      );
      expect(result.folderId).toBe(archiveFolder!.id);
    });

    it('prevents moving email to folder owned by another user', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        folderId: 'inbox',
      });

      await expect(emailService.moveToFolder('email-1', 'some-folder', 'user-2')).rejects.toThrow(
        'Not authorized',
      );
    });
  });

  describe('Search Across Email Fields', () => {
    it('finds emails matching subject', async () => {
      const results = [
        {
          id: 'email-1',
          subject: 'Meeting Tomorrow',
          bodyPlain: 'Let us meet',
          fromAddress: 'alice@test.com',
        },
      ];
      prisma.email.findMany.mockResolvedValue(results);
      prisma.email.count.mockResolvedValue(1);

      const search = await emailService.search('user-1', 'Meeting');
      expect(search.data).toHaveLength(1);
      expect(search.data[0].subject).toBe('Meeting Tomorrow');
    });

    it('finds emails matching sender address', async () => {
      const results = [{ id: 'email-2', subject: 'Hello', fromAddress: 'bob@company.com' }];
      prisma.email.findMany.mockResolvedValue(results);
      prisma.email.count.mockResolvedValue(1);

      const search = await emailService.search('user-1', 'bob@company');
      expect(search.data).toHaveLength(1);
    });

    it('returns empty results for non-matching query', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      const search = await emailService.search('user-1', 'nonexistent-keyword-xyz');
      expect(search.data).toHaveLength(0);
      expect(search.total).toBe(0);
    });

    it('paginates search results', async () => {
      const page1 = Array.from({ length: 10 }, (_, i) => ({
        id: `email-${i}`,
        subject: `Result ${i}`,
      }));
      prisma.email.findMany.mockResolvedValue(page1);
      prisma.email.count.mockResolvedValue(25);

      const search = await emailService.search('user-1', 'test', { page: 1, pageSize: 10 });
      expect(search.data).toHaveLength(10);
      expect(search.total).toBe(25);
      expect(search.totalPages).toBe(3);
      expect(search.hasNext).toBe(true);
      expect(search.hasPrev).toBe(false);
    });
  });

  describe('Star and Label Operations', () => {
    it('toggles star on and off', async () => {
      const unstarred = { id: 'email-1', userId: 'user-1', isStarred: false };
      prisma.email.findUnique.mockResolvedValue(unstarred);
      prisma.email.update.mockResolvedValue({ ...unstarred, isStarred: true });

      const starred = await emailService.markStarred('email-1', 'user-1');
      expect(starred.isStarred).toBe(true);

      prisma.email.findUnique.mockResolvedValue(starred);
      prisma.email.update.mockResolvedValue({ ...starred, isStarred: false });

      const unstarredAgain = await emailService.markStarred('email-1', 'user-1');
      expect(unstarredAgain.isStarred).toBe(false);
    });

    it('applies labels without duplicating', async () => {
      const email = { id: 'email-1', userId: 'user-1', labels: ['important'] };
      prisma.email.findUnique.mockResolvedValue(email);
      prisma.email.update.mockResolvedValue({ ...email, labels: ['important', 'work'] });

      const result = await emailService.applyLabel('email-1', 'work', 'user-1');
      expect((result as unknown as { labels: string[] }).labels).toContain('work');

      prisma.email.findUnique.mockResolvedValue({ ...email, labels: ['important', 'work'] });
      const noOp = await emailService.applyLabel('email-1', 'work', 'user-1');
      expect(noOp).toEqual({ ...email, labels: ['important', 'work'] });
    });
  });

  describe('Batch Operations', () => {
    it('deletes multiple emails (soft delete)', async () => {
      const emailIds = ['email-1', 'email-2', 'email-3'];

      for (const id of emailIds) {
        prisma.email.findUnique.mockResolvedValue({ id, userId: 'user-1' });
        prisma.email.update.mockResolvedValue({ id, isTrash: true, deletedAt: new Date() });

        const result = await emailService.trashEmail(id, 'user-1');
        expect(result.isTrash).toBe(true);
      }

      expect(prisma.email.update).toHaveBeenCalledTimes(3);
    });
  });
});
