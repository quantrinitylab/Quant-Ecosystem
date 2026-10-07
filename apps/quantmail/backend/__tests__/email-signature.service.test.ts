import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailSignatureService } from '../services/email-signature.service';

function createMockPrisma() {
  const prisma = {
    emailSignature: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    // Interactive transaction: run the callback with the same mock prisma so
    // every tx.<model> call lands on the same vi.fn() spies.
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return prisma;
}

function makeSignature(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sig-1',
    userId: 'user-1',
    name: 'Default',
    contentHtml: '<p>Best regards</p>',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('EmailSignatureService', () => {
  let service: EmailSignatureService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmailSignatureService(prisma as never);
  });

  describe('createSignature', () => {
    it('makes the first signature the default even without isDefault flag', async () => {
      prisma.emailSignature.count.mockResolvedValue(0);
      const created = makeSignature({ id: 'sig-1', name: 'First', isDefault: true });
      prisma.emailSignature.create.mockResolvedValue(created);

      const result = await service.createSignature('user-1', {
        name: 'First',
        contentHtml: '<p>Hi</p>',
      });

      expect(result.isDefault).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.emailSignature.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(prisma.emailSignature.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          name: 'First',
          contentHtml: '<p>Hi</p>',
          isDefault: true,
        },
      });
    });

    it('creates a non-default signature when not first and isDefault is not set', async () => {
      prisma.emailSignature.count.mockResolvedValue(2);
      const created = makeSignature({ id: 'sig-3', name: 'Casual', isDefault: false });
      prisma.emailSignature.create.mockResolvedValue(created);

      const result = await service.createSignature('user-1', {
        name: 'Casual',
        contentHtml: '<p>Cheers</p>',
      });

      expect(result.isDefault).toBe(false);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.emailSignature.updateMany).not.toHaveBeenCalled();
      expect(prisma.emailSignature.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          name: 'Casual',
          contentHtml: '<p>Cheers</p>',
          isDefault: false,
        },
      });
    });

    it('clears other defaults atomically when creating with isDefault true', async () => {
      prisma.emailSignature.count.mockResolvedValue(3);
      const created = makeSignature({ id: 'sig-4', name: 'New Default', isDefault: true });
      prisma.emailSignature.create.mockResolvedValue(created);

      const result = await service.createSignature('user-1', {
        name: 'New Default',
        contentHtml: '<p>Regards</p>',
        isDefault: true,
      });

      expect(result.isDefault).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.emailSignature.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('listSignatures', () => {
    it('lists signatures default first then by name ascending', async () => {
      const signatures = [
        makeSignature({ id: 'sig-1', name: 'Work', isDefault: true }),
        makeSignature({ id: 'sig-2', name: 'Casual', isDefault: false }),
      ];
      prisma.emailSignature.findMany.mockResolvedValue(signatures);

      const result = await service.listSignatures('user-1');

      expect(result).toHaveLength(2);
      expect(prisma.emailSignature.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      });
    });
  });

  describe('getSignature', () => {
    it('returns a signature owned by the user', async () => {
      const signature = makeSignature({ id: 'sig-1', userId: 'user-1' });
      prisma.emailSignature.findUnique.mockResolvedValue(signature);

      const result = await service.getSignature('sig-1', 'user-1');

      expect(result.id).toBe('sig-1');
    });

    it('throws SIGNATURE_NOT_FOUND when the signature does not exist', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(null);

      await expect(service.getSignature('missing', 'user-1')).rejects.toThrow(
        'Signature not found',
      );
    });

    it('throws FORBIDDEN when the user does not own the signature', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(
        makeSignature({ id: 'sig-1', userId: 'other-user' }),
      );

      await expect(service.getSignature('sig-1', 'user-1')).rejects.toThrow(
        'Not authorized to access this signature',
      );
    });
  });

  describe('getDefaultSignature', () => {
    it('returns the default signature for the user', async () => {
      const def = makeSignature({ id: 'sig-1', isDefault: true });
      prisma.emailSignature.findFirst.mockResolvedValue(def);

      const result = await service.getDefaultSignature('user-1');

      expect(result?.isDefault).toBe(true);
      expect(prisma.emailSignature.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
      });
    });

    it('returns null when the user has no default signature', async () => {
      prisma.emailSignature.findFirst.mockResolvedValue(null);

      const result = await service.getDefaultSignature('user-1');

      expect(result).toBeNull();
    });
  });

  describe('updateSignature', () => {
    it('updates fields without touching defaults when isDefault is not set', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(
        makeSignature({ id: 'sig-1', userId: 'user-1' }),
      );
      const updated = makeSignature({ id: 'sig-1', name: 'Renamed' });
      prisma.emailSignature.update.mockResolvedValue(updated);

      const result = await service.updateSignature('sig-1', 'user-1', { name: 'Renamed' });

      expect(result.name).toBe('Renamed');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.emailSignature.update).toHaveBeenCalledWith({
        where: { id: 'sig-1' },
        data: { name: 'Renamed' },
      });
    });

    it('clears other defaults atomically when isDefault is set true', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(
        makeSignature({ id: 'sig-1', userId: 'user-1' }),
      );
      const updated = makeSignature({ id: 'sig-1', isDefault: true });
      prisma.emailSignature.update.mockResolvedValue(updated);

      const result = await service.updateSignature('sig-1', 'user-1', { isDefault: true });

      expect(result.isDefault).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.emailSignature.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true, NOT: { id: 'sig-1' } },
        data: { isDefault: false },
      });
    });

    it('throws FORBIDDEN when updating a signature owned by another user', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(
        makeSignature({ id: 'sig-1', userId: 'other-user' }),
      );

      await expect(service.updateSignature('sig-1', 'user-1', { name: 'Hacked' })).rejects.toThrow(
        'Not authorized to access this signature',
      );
      expect(prisma.emailSignature.update).not.toHaveBeenCalled();
    });
  });

  describe('setDefault', () => {
    it('clears others and sets the target as default in a transaction', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(
        makeSignature({ id: 'sig-2', userId: 'user-1', isDefault: false }),
      );
      const updated = makeSignature({ id: 'sig-2', isDefault: true });
      prisma.emailSignature.update.mockResolvedValue(updated);

      const result = await service.setDefault('sig-2', 'user-1');

      expect(result.isDefault).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.emailSignature.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true, NOT: { id: 'sig-2' } },
        data: { isDefault: false },
      });
      expect(prisma.emailSignature.update).toHaveBeenCalledWith({
        where: { id: 'sig-2' },
        data: { isDefault: true },
      });
    });

    it('throws FORBIDDEN when the user does not own the signature', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(
        makeSignature({ id: 'sig-2', userId: 'other-user' }),
      );

      await expect(service.setDefault('sig-2', 'user-1')).rejects.toThrow(
        'Not authorized to access this signature',
      );
    });
  });

  describe('deleteSignature', () => {
    it('promotes the next signature (by name) when deleting the default', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(
        makeSignature({ id: 'sig-1', userId: 'user-1', isDefault: true }),
      );
      const deleted = makeSignature({ id: 'sig-1', isDefault: true });
      prisma.emailSignature.delete.mockResolvedValue(deleted);
      const next = makeSignature({ id: 'sig-2', name: 'Backup', isDefault: false });
      prisma.emailSignature.findFirst.mockResolvedValue(next);
      prisma.emailSignature.update.mockResolvedValue({ ...next, isDefault: true });

      const result = await service.deleteSignature('sig-1', 'user-1');

      expect(result.id).toBe('sig-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.emailSignature.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { name: 'asc' },
      });
      expect(prisma.emailSignature.update).toHaveBeenCalledWith({
        where: { id: 'sig-2' },
        data: { isDefault: true },
      });
    });

    it('does not promote anything when deleting a non-default signature', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(
        makeSignature({ id: 'sig-2', userId: 'user-1', isDefault: false }),
      );
      prisma.emailSignature.delete.mockResolvedValue(
        makeSignature({ id: 'sig-2', isDefault: false }),
      );

      await service.deleteSignature('sig-2', 'user-1');

      expect(prisma.emailSignature.findFirst).not.toHaveBeenCalled();
      expect(prisma.emailSignature.update).not.toHaveBeenCalled();
    });

    it('deletes the last default without promoting when no others remain', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(
        makeSignature({ id: 'sig-1', userId: 'user-1', isDefault: true }),
      );
      prisma.emailSignature.delete.mockResolvedValue(
        makeSignature({ id: 'sig-1', isDefault: true }),
      );
      prisma.emailSignature.findFirst.mockResolvedValue(null);

      const result = await service.deleteSignature('sig-1', 'user-1');

      expect(result.id).toBe('sig-1');
      expect(prisma.emailSignature.update).not.toHaveBeenCalled();
    });

    it('throws FORBIDDEN when deleting a signature owned by another user', async () => {
      prisma.emailSignature.findUnique.mockResolvedValue(
        makeSignature({ id: 'sig-1', userId: 'other-user' }),
      );

      await expect(service.deleteSignature('sig-1', 'user-1')).rejects.toThrow(
        'Not authorized to access this signature',
      );
      expect(prisma.emailSignature.delete).not.toHaveBeenCalled();
    });
  });
});
