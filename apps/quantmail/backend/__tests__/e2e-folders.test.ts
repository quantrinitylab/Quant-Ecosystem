import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FolderService } from '../services/folder.service';

function createMockPrisma() {
  return {
    emailFolder: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    email: {
      count: vi.fn(),
    },
  };
}

describe('E2E Folder Management', () => {
  let service: FolderService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new FolderService(prisma as never);
  });

  describe('Default Folder Initialization', () => {
    it('creates all 6 system folders for new user', async () => {
      prisma.emailFolder.findMany.mockResolvedValue([]);
      let idx = 0;
      prisma.emailFolder.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          idx++;
          return { id: `f-${idx}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        },
      );

      const folders = await service.initializeDefaultFolders('new-user');

      expect(folders).toHaveLength(6);
      expect(folders.map((f) => f.name)).toEqual([
        'Inbox',
        'Sent',
        'Drafts',
        'Trash',
        'Spam',
        'Archive',
      ]);
      expect(folders.map((f) => f.type)).toEqual([
        'INBOX',
        'SENT',
        'DRAFTS',
        'TRASH',
        'SPAM',
        'ARCHIVE',
      ]);
    });

    it('skips initialization if folders already exist', async () => {
      prisma.emailFolder.findMany.mockResolvedValue([
        { id: 'f-1', userId: 'user-1', name: 'Inbox', type: 'INBOX' },
      ]);

      const folders = await service.initializeDefaultFolders('user-1');

      expect(folders).toHaveLength(1);
      expect(prisma.emailFolder.create).not.toHaveBeenCalled();
    });
  });

  describe('Custom Folder CRUD', () => {
    it('creates a custom folder with color and icon', async () => {
      prisma.emailFolder.findFirst.mockResolvedValue(null);
      const mockFolder = {
        id: 'f-custom',
        userId: 'user-1',
        name: 'Projects',
        type: 'CUSTOM',
        color: '#3b82f6',
        icon: 'folder',
        emailCount: 0,
        unreadCount: 0,
      };
      prisma.emailFolder.create.mockResolvedValue(mockFolder as never);

      const folder = await service.createFolder({
        userId: 'user-1',
        name: 'Projects',
        color: '#3b82f6',
        icon: 'folder',
      });

      expect(folder.name).toBe('Projects');
      expect(folder.type).toBe('CUSTOM');
      expect((folder as unknown as { color: string }).color).toBe('#3b82f6');
    });

    it('prevents duplicate folder names per user', async () => {
      prisma.emailFolder.findFirst.mockResolvedValue({
        id: 'f-existing',
        userId: 'user-1',
        name: 'Projects',
      });

      await expect(service.createFolder({ userId: 'user-1', name: 'Projects' })).rejects.toThrow(
        'already exists',
      );
    });

    it('allows same folder name across different users', async () => {
      prisma.emailFolder.findFirst.mockResolvedValue(null);
      prisma.emailFolder.create.mockResolvedValue({
        id: 'f-user2',
        userId: 'user-2',
        name: 'Projects',
        type: 'CUSTOM',
      });

      const folder = await service.createFolder({ userId: 'user-2', name: 'Projects' });
      expect(folder.userId).toBe('user-2');
    });

    it('renames a custom folder', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue({
        id: 'f-1',
        userId: 'user-1',
        name: 'Old Name',
        type: 'CUSTOM',
      });
      prisma.emailFolder.findFirst.mockResolvedValue(null);
      prisma.emailFolder.update.mockResolvedValue({
        id: 'f-1',
        userId: 'user-1',
        name: 'New Name',
        type: 'CUSTOM',
      });

      const updated = await service.updateFolder('f-1', 'user-1', { name: 'New Name' });
      expect(updated.name).toBe('New Name');
    });

    it('prevents renaming to a duplicate name', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue({
        id: 'f-1',
        userId: 'user-1',
        name: 'Old Name',
      });
      prisma.emailFolder.findFirst.mockResolvedValue({
        id: 'f-2',
        name: 'Taken Name',
      });

      await expect(service.updateFolder('f-1', 'user-1', { name: 'Taken Name' })).rejects.toThrow(
        'already exists',
      );
    });

    it('deletes a custom folder', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue({
        id: 'f-custom',
        userId: 'user-1',
        name: 'Old Stuff',
        type: 'CUSTOM',
      });
      prisma.emailFolder.delete.mockResolvedValue({
        id: 'f-custom',
        name: 'Old Stuff',
      });

      const deleted = await service.deleteFolder('f-custom', 'user-1');
      expect(deleted.name).toBe('Old Stuff');
    });

    it('prevents deletion of system folders', async () => {
      const systemTypes = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE'];

      for (const type of systemTypes) {
        prisma.emailFolder.findUnique.mockResolvedValue({
          id: `f-${type.toLowerCase()}`,
          userId: 'user-1',
          name: type,
          type,
        });

        await expect(service.deleteFolder(`f-${type.toLowerCase()}`, 'user-1')).rejects.toThrow(
          'Cannot delete system folders',
        );
      }
    });
  });

  describe('Folder Listing and Stats', () => {
    it('lists all folders for a user ordered by creation date', async () => {
      const folders = [
        {
          id: 'f-1',
          userId: 'user-1',
          name: 'Inbox',
          type: 'INBOX',
          emailCount: 42,
          unreadCount: 5,
        },
        { id: 'f-2', userId: 'user-1', name: 'Sent', type: 'SENT', emailCount: 18, unreadCount: 0 },
        {
          id: 'f-3',
          userId: 'user-1',
          name: 'Projects',
          type: 'CUSTOM',
          emailCount: 7,
          unreadCount: 2,
        },
      ];
      prisma.emailFolder.findMany.mockResolvedValue(folders);

      const result = await service.listFolders('user-1');

      expect(result).toHaveLength(3);
      expect(prisma.emailFolder.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('returns email and unread counts for a folder', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue({
        id: 'f-1',
        userId: 'user-1',
        name: 'Inbox',
      });
      prisma.email.count.mockResolvedValueOnce(42);
      prisma.email.count.mockResolvedValueOnce(5);

      const stats = await service.getFolderStats('f-1', 'user-1');

      expect(stats.emailCount).toBe(42);
      expect(stats.unreadCount).toBe(5);
    });

    it('throws for non-existent folder stats', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue(null);

      await expect(service.getFolderStats('missing', 'user-1')).rejects.toThrow('Folder not found');
    });
  });

  describe('Authorization', () => {
    it("prevents updating another user's folder", async () => {
      prisma.emailFolder.findUnique.mockResolvedValue({
        id: 'f-1',
        userId: 'user-1',
        name: 'Private',
      });

      await expect(service.updateFolder('f-1', 'user-2', { name: 'Hacked' })).rejects.toThrow(
        'Not authorized',
      );
    });

    it("prevents deleting another user's folder", async () => {
      prisma.emailFolder.findUnique.mockResolvedValue({
        id: 'f-1',
        userId: 'user-1',
        name: 'Private',
        type: 'CUSTOM',
      });

      await expect(service.deleteFolder('f-1', 'user-2')).rejects.toThrow('Not authorized');
    });
  });
});
