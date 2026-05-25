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

describe('FolderService', () => {
  let service: FolderService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new FolderService(prisma as never);
  });

  describe('createFolder', () => {
    it('creates a new folder', async () => {
      prisma.emailFolder.findFirst.mockResolvedValue(null);
      const mockFolder = {
        id: 'folder-1',
        userId: 'user-1',
        name: 'Projects',
        type: 'CUSTOM',
        color: null,
        icon: null,
        emailCount: 0,
        unreadCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.emailFolder.create.mockResolvedValue(mockFolder);

      const result = await service.createFolder({
        userId: 'user-1',
        name: 'Projects',
      });

      expect(result).toEqual(mockFolder);
      expect(prisma.emailFolder.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          name: 'Projects',
          type: 'CUSTOM',
          color: null,
          icon: null,
          emailCount: 0,
          unreadCount: 0,
        },
      });
    });

    it('prevents duplicate folder names for the same user', async () => {
      prisma.emailFolder.findFirst.mockResolvedValue({
        id: 'existing-folder',
        userId: 'user-1',
        name: 'Projects',
      });

      await expect(service.createFolder({ userId: 'user-1', name: 'Projects' })).rejects.toThrow(
        'Folder with name "Projects" already exists',
      );
    });

    it('allows same folder name for different users', async () => {
      prisma.emailFolder.findFirst.mockResolvedValue(null);
      prisma.emailFolder.create.mockResolvedValue({
        id: 'folder-2',
        userId: 'user-2',
        name: 'Projects',
        type: 'CUSTOM',
      });

      const result = await service.createFolder({
        userId: 'user-2',
        name: 'Projects',
      });

      expect(result.userId).toBe('user-2');
      expect(result.name).toBe('Projects');
    });
  });

  describe('listFolders', () => {
    it('returns all folders for a user', async () => {
      const folders = [
        {
          id: 'f-1',
          userId: 'user-1',
          name: 'Inbox',
          type: 'INBOX',
          emailCount: 10,
          unreadCount: 3,
        },
        { id: 'f-2', userId: 'user-1', name: 'Sent', type: 'SENT', emailCount: 5, unreadCount: 0 },
      ];
      prisma.emailFolder.findMany.mockResolvedValue(folders);

      const result = await service.listFolders('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Inbox');
      expect(prisma.emailFolder.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('deleteFolder', () => {
    it('deletes a custom folder', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue({
        id: 'folder-1',
        userId: 'user-1',
        name: 'Old Stuff',
        type: 'CUSTOM',
      });
      prisma.emailFolder.delete.mockResolvedValue({
        id: 'folder-1',
        name: 'Old Stuff',
      });

      const result = await service.deleteFolder('folder-1', 'user-1');

      expect(result.name).toBe('Old Stuff');
    });

    it('prevents deletion of system folders', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue({
        id: 'folder-inbox',
        userId: 'user-1',
        name: 'Inbox',
        type: 'INBOX',
      });

      await expect(service.deleteFolder('folder-inbox', 'user-1')).rejects.toThrow(
        'Cannot delete system folders',
      );
    });

    it('throws FOLDER_NOT_FOUND for non-existent folder', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue(null);

      await expect(service.deleteFolder('missing', 'user-1')).rejects.toThrow('Folder not found');
    });
  });

  describe('initializeDefaultFolders', () => {
    it('creates default folders when user has none', async () => {
      prisma.emailFolder.findMany.mockResolvedValue([]);

      let callIndex = 0;
      prisma.emailFolder.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          callIndex++;
          return {
            id: `folder-${callIndex}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      );

      const result = await service.initializeDefaultFolders('user-1');

      expect(result).toHaveLength(6);
      expect(result.map((f) => f.name)).toEqual([
        'Inbox',
        'Sent',
        'Drafts',
        'Trash',
        'Spam',
        'Archive',
      ]);
      expect(prisma.emailFolder.create).toHaveBeenCalledTimes(6);
    });

    it('returns existing folders if user already has them', async () => {
      const existing = [{ id: 'f-1', userId: 'user-1', name: 'Inbox', type: 'INBOX' }];
      prisma.emailFolder.findMany.mockResolvedValue(existing);

      const result = await service.initializeDefaultFolders('user-1');

      expect(result).toEqual(existing);
      expect(prisma.emailFolder.create).not.toHaveBeenCalled();
    });
  });

  describe('getFolderStats', () => {
    it('returns email and unread counts', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue({
        id: 'folder-1',
        userId: 'user-1',
      });
      prisma.email.count.mockResolvedValueOnce(25);
      prisma.email.count.mockResolvedValueOnce(5);

      const result = await service.getFolderStats('folder-1', 'user-1');

      expect(result.emailCount).toBe(25);
      expect(result.unreadCount).toBe(5);
    });

    it('throws FOLDER_NOT_FOUND for non-existent folder', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue(null);

      await expect(service.getFolderStats('missing', 'user-1')).rejects.toThrow('Folder not found');
    });
  });

  describe('updateFolder', () => {
    it('prevents renaming to a duplicate name', async () => {
      prisma.emailFolder.findUnique.mockResolvedValue({
        id: 'folder-1',
        userId: 'user-1',
        name: 'Old Name',
      });
      prisma.emailFolder.findFirst.mockResolvedValue({
        id: 'folder-2',
        name: 'Existing Name',
      });

      await expect(
        service.updateFolder('folder-1', 'user-1', { name: 'Existing Name' }),
      ).rejects.toThrow('Folder with name "Existing Name" already exists');
    });
  });
});
