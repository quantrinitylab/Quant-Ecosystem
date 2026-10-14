// @vitest-environment node

// One shared folder-resolution rule for Quanty's organize flow: both
// "Move here" (autoOrganize apply=true) and "Copy here" (the frontend copies
// into the suggest response's folderId) resolve the destination as the
// exact-case, ROOT-level (parentId: null) folder named for the category.
// Suggest resolves without creating; move creates the root folder when
// missing. A nested or differently-cased folder is never matched.
import { describe, expect, it, vi } from 'vitest';
import { AIOrganizeService } from '../services/ai-organize.service';

const FILE_ROW = {
  id: 'file-1', userId: 'user-1', name: 'report.txt', mimeType: 'text/plain', isDeleted: false,
};

function makeService(opts: { rootFolder: { id: string } | null }) {
  const prisma = {
    file: {
      findUnique: vi.fn().mockResolvedValue(FILE_ROW),
      update: vi.fn(),
    },
    folder: {
      // Emulates the DB for the shared-rule where clause
      // { userId, parentId: null, name: <category>, isDeleted: false }.
      // Anything else (any depth, any case) would not match, so the stub
      // only answers that exact clause.
      findFirst: vi.fn(async (args: { where?: Record<string, unknown> }) => {
        const where = args?.where ?? {};
        if (where.parentId === null && where.name === 'Documents' && where.isDeleted === false) {
          return opts.rootFolder;
        }
        return null;
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'folder-created',
        ...args.data,
      })),
    },
  };
  const service = new AIOrganizeService({ infer: vi.fn() } as never, prisma);
  return { service, prisma };
}

describe('AIOrganizeService shared folder-resolution rule', () => {
  it('suggest resolves the existing root folder and performs no writes', async () => {
    const { service, prisma } = makeService({ rootFolder: { id: 'folder-root-docs' } });

    const result = await service.autoOrganize('file-1', 'user-1', 'report');

    expect(result).toMatchObject({
      fileId: 'file-1',
      category: 'Documents',
      suggestedFolder: '/Documents',
      folderId: 'folder-root-docs',
      applied: false,
    });
    // The single shared rule: exact-case, root-level (parentId: null).
    expect(prisma.folder.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', parentId: null, name: 'Documents', isDeleted: false },
    });
    expect(prisma.folder.create).not.toHaveBeenCalled();
    expect(prisma.file.update).not.toHaveBeenCalled();
  });

  it('suggest ignores a nested lowercase folder; move then creates the root one — same rule, same label', async () => {
    // Only a nested, differently-cased "documents" folder exists in the DB, so
    // the shared root + exact-case query misses. The old client-side
    // case-insensitive any-depth lookup would have matched it here; the
    // backend rule honestly reports no folder.
    const { service, prisma } = makeService({ rootFolder: null });

    const suggestion = await service.autoOrganize('file-1', 'user-1', 'report');
    expect(suggestion).toMatchObject({ folderId: null, applied: false });
    expect(prisma.folder.create).not.toHaveBeenCalled();
    expect(prisma.file.update).not.toHaveBeenCalled();

    // "Move here" resolves with the same rule and creates the ROOT-level,
    // exact-case folder the UI labels "/Documents" — the folder the copy
    // path (create-and-copy) also creates, so both buttons can only ever
    // land in the same real destination.
    const applied = await service.autoOrganize('file-1', 'user-1', 'report', true);
    expect(applied).toMatchObject({ folderId: 'folder-created', applied: true });
    expect(prisma.folder.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', name: 'Documents', parentId: null, path: '/Documents' },
    });
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: { folderId: 'folder-created' },
    });
  });

  it('move reuses the existing root folder instead of creating a duplicate', async () => {
    const { service, prisma } = makeService({ rootFolder: { id: 'folder-root-docs' } });

    const applied = await service.autoOrganize('file-1', 'user-1', 'report', true);

    expect(applied).toMatchObject({ folderId: 'folder-root-docs', applied: true });
    expect(prisma.folder.create).not.toHaveBeenCalled();
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: { folderId: 'folder-root-docs' },
    });
  });
});
