// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { AIOrganizeService } from '../services/ai-organize.service';

describe('AIOrganizeService suggestion default', () => {
  it('suggests without moving when apply is omitted', async () => {
    const update = vi.fn();
    const prisma = {
      file: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'file-1', userId: 'user-1', name: 'report.txt', mimeType: 'text/plain', isDeleted: false,
        }),
        update,
      },
      folder: { findFirst: vi.fn(), create: vi.fn() },
    };
    const ai = { infer: vi.fn() };
    const service = new AIOrganizeService(ai as never, prisma);

    await expect(service.autoOrganize('file-1', 'user-1', 'report')).resolves.toMatchObject({
      fileId: 'file-1', category: 'Documents', suggestedFolder: '/Documents', folderId: null, applied: false,
    });
    expect(update).not.toHaveBeenCalled();
    expect(prisma.folder.findFirst).not.toHaveBeenCalled();
  });
});
