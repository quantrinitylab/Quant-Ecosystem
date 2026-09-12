// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { AIDuplicateService, PERCEPTUAL_MIN_BYTES } from '../services/ai-duplicate.service';

describe('AIDuplicateService exact duplicates', () => {
  it('queries all active user files and groups byte-identical files at any size', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a', name: 'a.bin', size: 1, contentHash: 'same' },
      { id: 'b', name: 'b.bin', size: 1, contentHash: 'same' },
      { id: 'c', name: 'c.bin', size: 2, contentHash: 'different' },
    ]);
    const service = new AIDuplicateService({ file: { findMany } });

    await expect(service.findDuplicates('user-1')).resolves.toEqual({
      groups: [{
        hash: 'same',
        files: [
          { id: 'a', name: 'a.bin', size: 1 },
          { id: 'b', name: 'b.bin', size: 1 },
        ],
      }],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isDeleted: false },
      select: { id: true, name: true, size: true, contentHash: true },
    });
  });

  it('retains the minimum size guard for perceptual comparison only', () => {
    const service = new AIDuplicateService({ file: { findMany: vi.fn() } });
    expect(PERCEPTUAL_MIN_BYTES).toBe(64);
    expect(service.compareTwoFiles(Buffer.alloc(63), Buffer.alloc(63))).toEqual({
      similarity: 0,
      isLikelyDuplicate: false,
    });
  });
});
