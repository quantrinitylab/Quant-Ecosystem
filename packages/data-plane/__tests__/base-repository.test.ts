import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataPlaneRepository } from '../src/base-repository.js';
import type { DataPlaneRepositoryConfig } from '../src/base-repository.js';

interface TestRecord {
  id: string;
  name: string;
  email: string;
  version: number;
  deletedAt: Date | null;
}

describe('DataPlaneRepository', () => {
  let mockPrimary: Record<string, unknown>;
  let mockReplica: Record<string, unknown>;
  let config: DataPlaneRepositoryConfig;

  beforeEach(() => {
    const mockDelegate = {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const mockOutboxDelegate = {
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'evt-1', ...data, createdAt: new Date(), publishedAt: null }),
        ),
    };

    const mockAuditDelegate = {
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'audit-1', ...data, createdAt: new Date() }),
        ),
    };

    mockPrimary = {
      testModel: { ...mockDelegate },
      outboxEvent: { ...mockOutboxDelegate },
      auditLog: { ...mockAuditDelegate },
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          testModel: { ...mockDelegate },
          outboxEvent: { ...mockOutboxDelegate },
          auditLog: { ...mockAuditDelegate },
        }),
      ),
    };

    mockReplica = {
      testModel: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
    };

    config = {
      modelName: 'testModel',
      primaryClient: mockPrimary as never,
      replicaClient: mockReplica as never,
      enableAudit: true,
      enableSoftDelete: true,
      enableOptimisticLocking: false,
    };
  });

  describe('findById', () => {
    it('should route reads to replica', async () => {
      const repo = new DataPlaneRepository<TestRecord>(config);
      const mockRecord = { id: '1', name: 'Test', email: 'a@b.com', version: 1, deletedAt: null };
      (
        mockReplica['testModel'] as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockResolvedValue(mockRecord);

      const result = await repo.findById('1');

      expect(result).toEqual(mockRecord);
      expect(
        (mockReplica['testModel'] as { findUnique: ReturnType<typeof vi.fn> }).findUnique,
      ).toHaveBeenCalledWith({
        where: { id: '1', deletedAt: null },
      });
    });

    it('should route reads to primary when usePrimary is true', async () => {
      const repo = new DataPlaneRepository<TestRecord>(config);
      const mockRecord = { id: '1', name: 'Test', email: 'a@b.com', version: 1, deletedAt: null };
      (
        mockPrimary['testModel'] as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockResolvedValue(mockRecord);

      const result = await repo.findById('1', { usePrimary: true });

      expect(result).toEqual(mockRecord);
      expect(
        (mockPrimary['testModel'] as { findUnique: ReturnType<typeof vi.fn> }).findUnique,
      ).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      const repo = new DataPlaneRepository<TestRecord>(config);
      (
        mockReplica['testModel'] as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockResolvedValue(null);

      const result = await repo.findById('999');

      expect(result).toBeNull();
    });
  });

  describe('findMany', () => {
    it('should apply soft delete filter', async () => {
      const repo = new DataPlaneRepository<TestRecord>(config);
      const records = [{ id: '1', name: 'Test', email: 'a@b.com', version: 1, deletedAt: null }];
      (
        mockReplica['testModel'] as { findMany: ReturnType<typeof vi.fn> }
      ).findMany.mockResolvedValue(records);

      const result = await repo.findMany({ name: 'Test' });

      expect(result).toEqual(records);
      expect(
        (mockReplica['testModel'] as { findMany: ReturnType<typeof vi.fn> }).findMany,
      ).toHaveBeenCalledWith({
        where: { name: 'Test', deletedAt: null },
      });
    });
  });

  describe('create', () => {
    it('should use primary client and write outbox event', async () => {
      const repo = new DataPlaneRepository<TestRecord>(config);
      const txDelegate = mockPrimary['$transaction'] as ReturnType<typeof vi.fn>;

      // Override the $transaction to capture what happens inside
      const createdRecord = {
        id: 'new-1',
        name: 'Created',
        email: 'c@d.com',
        version: 1,
        deletedAt: null,
      };
      txDelegate.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          testModel: {
            create: vi.fn().mockResolvedValue(createdRecord),
          },
          outboxEvent: {
            create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
          },
        };
        return fn(txMock);
      });

      const result = await repo.create(
        { name: 'Created', email: 'c@d.com' },
        { actorId: 'user-1', ipAddress: '1.2.3.4' },
      );

      expect(result).toEqual(createdRecord);
      expect(txDelegate).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should use primary client and write outbox + audit', async () => {
      const repo = new DataPlaneRepository<TestRecord>(config);
      const txDelegate = mockPrimary['$transaction'] as ReturnType<typeof vi.fn>;

      const updatedRecord = {
        id: '1',
        name: 'Updated',
        email: 'a@b.com',
        version: 1,
        deletedAt: null,
      };
      txDelegate.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          testModel: {
            findUnique: vi
              .fn()
              .mockResolvedValue({ id: '1', name: 'Old', email: 'a@b.com', version: 1 }),
            update: vi.fn().mockResolvedValue(updatedRecord),
          },
          outboxEvent: {
            create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
          },
        };
        return fn(txMock);
      });

      const result = await repo.update('1', { name: 'Updated' }, { actorId: 'user-1' });

      expect(result).toEqual(updatedRecord);
    });
  });

  describe('delete', () => {
    it('should soft delete when enabled', async () => {
      const repo = new DataPlaneRepository<TestRecord>(config);
      const txDelegate = mockPrimary['$transaction'] as ReturnType<typeof vi.fn>;

      const softDeleteUpdate = vi.fn().mockResolvedValue({ id: '1' });
      txDelegate.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          testModel: {
            update: softDeleteUpdate,
            delete: vi.fn(),
          },
          outboxEvent: {
            create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
          },
        };
        return fn(txMock);
      });

      await repo.delete('1', { actorId: 'user-1' });

      expect(txDelegate).toHaveBeenCalled();
      expect(softDeleteUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should hard delete when soft delete is disabled', async () => {
      const hardDeleteConfig: DataPlaneRepositoryConfig = {
        ...config,
        enableSoftDelete: false,
      };
      const repo = new DataPlaneRepository<TestRecord>(hardDeleteConfig);
      const txDelegate = mockPrimary['$transaction'] as ReturnType<typeof vi.fn>;

      const hardDeleteFn = vi.fn().mockResolvedValue({ id: '1' });
      txDelegate.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          testModel: {
            update: vi.fn(),
            delete: hardDeleteFn,
          },
          outboxEvent: {
            create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
          },
        };
        return fn(txMock);
      });

      await repo.delete('1', { actorId: 'user-1' });

      expect(hardDeleteFn).toHaveBeenCalledWith({ where: { id: '1' } });
    });
  });

  describe('encryption', () => {
    it('should encrypt and decrypt specified fields', async () => {
      const encConfig: DataPlaneRepositoryConfig = {
        ...config,
        encryptedFields: ['email'],
        encryptionKey: 'my-secret-master-key-for-testing-purposes',
        enableSoftDelete: false,
        enableAudit: false,
      };
      const repo = new DataPlaneRepository<TestRecord>(encConfig);
      const txDelegate = mockPrimary['$transaction'] as ReturnType<typeof vi.fn>;

      let capturedCreateData: Record<string, unknown> = {};
      txDelegate.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          testModel: {
            create: vi.fn().mockImplementation(({ data }) => {
              capturedCreateData = data as Record<string, unknown>;
              return Promise.resolve({ id: 'new-1', ...data });
            }),
          },
          outboxEvent: {
            create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
          },
        };
        return fn(txMock);
      });

      const result = await repo.create({ name: 'Test', email: 'secret@email.com' });

      // The email field stored should be encrypted (JSON string of ciphertext/iv/authTag)
      expect(capturedCreateData['email']).not.toBe('secret@email.com');
      expect(typeof capturedCreateData['email']).toBe('string');

      // The returned result should have decrypted email
      expect(result.email).toBe('secret@email.com');
    });
  });
});
