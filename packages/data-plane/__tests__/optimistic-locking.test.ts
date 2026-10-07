import { describe, it, expect, vi } from 'vitest';
import { OptimisticLock, OptimisticLockError } from '../src/optimistic-locking.js';

describe('OptimisticLock', () => {
  const lock = new OptimisticLock();

  function createMockTx(existingRecord: Record<string, unknown> | null) {
    return {
      testModel: {
        findUnique: vi.fn().mockResolvedValue(existingRecord),
        update: vi
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...existingRecord, ...data })),
      },
    };
  }

  it('should update when version matches', async () => {
    const mockTx = createMockTx({ id: '1', version: 3, name: 'old' });

    const result = await lock.checkAndUpdate(mockTx as never, 'testModel', '1', 3, { name: 'new' });

    expect(result).toEqual({ id: '1', version: 4, name: 'new' });
    expect(mockTx.testModel.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { name: 'new', version: 4 },
    });
  });

  it('should throw OptimisticLockError when version mismatches', async () => {
    const mockTx = createMockTx({ id: '1', version: 5, name: 'old' });

    await expect(
      lock.checkAndUpdate(mockTx as never, 'testModel', '1', 3, { name: 'new' }),
    ).rejects.toThrow(OptimisticLockError);

    await expect(
      lock.checkAndUpdate(mockTx as never, 'testModel', '1', 3, { name: 'new' }),
    ).rejects.toMatchObject({
      expectedVersion: 3,
      actualVersion: 5,
    });
  });

  it('should throw error when record not found', async () => {
    const mockTx = createMockTx(null);

    await expect(
      lock.checkAndUpdate(mockTx as never, 'testModel', '999', 1, { name: 'new' }),
    ).rejects.toThrow('Record not found');
  });

  it('should extend Error', () => {
    const error = new OptimisticLockError(1, 2);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('OptimisticLockError');
    expect(error.message).toContain('expected version 1');
    expect(error.message).toContain('found 2');
  });
});
