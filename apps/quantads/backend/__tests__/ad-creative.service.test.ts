import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdCreativeService } from '../services/ad-creative.service';

function createMockPrisma() {
  return {
    adCreative: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('AdCreativeService', () => {
  let service: AdCreativeService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AdCreativeService(prisma as never);
  });

  describe('createCreative', () => {
    it('creates a creative with defaults (type IMAGE, null optional fields)', async () => {
      const mockCreative = {
        id: 'cr-1',
        advertiserId: 'adv-1',
        type: 'IMAGE',
        name: 'Summer Banner',
        headline: null,
        description: null,
        mediaUrl: null,
        callToAction: null,
        landingUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.adCreative.create.mockResolvedValue(mockCreative);

      const result = await service.createCreative('adv-1', { name: 'Summer Banner' });

      expect(result.type).toBe('IMAGE');
      expect(result.name).toBe('Summer Banner');
      expect(prisma.adCreative.create).toHaveBeenCalledWith({
        data: {
          advertiserId: 'adv-1',
          type: 'IMAGE',
          name: 'Summer Banner',
          headline: null,
          description: null,
          mediaUrl: null,
          callToAction: null,
          landingUrl: null,
        },
      });
    });

    it('creates a creative with explicit type and fields', async () => {
      prisma.adCreative.create.mockResolvedValue({ id: 'cr-2', type: 'VIDEO' });

      await service.createCreative('adv-1', {
        name: 'Promo Video',
        type: 'VIDEO',
        headline: 'Watch now',
        mediaUrl: 'https://cdn.example.com/v.mp4',
      });

      expect(prisma.adCreative.create).toHaveBeenCalledWith({
        data: {
          advertiserId: 'adv-1',
          type: 'VIDEO',
          name: 'Promo Video',
          headline: 'Watch now',
          description: null,
          mediaUrl: 'https://cdn.example.com/v.mp4',
          callToAction: null,
          landingUrl: null,
        },
      });
    });

    it('throws CREATIVE_NAME_REQUIRED when name is missing/blank', async () => {
      await expect(service.createCreative('adv-1', { name: '   ' })).rejects.toThrow(
        'Creative name is required',
      );
      expect(prisma.adCreative.create).not.toHaveBeenCalled();
    });

    it('throws INVALID_CREATIVE_TYPE for an unknown type', async () => {
      await expect(
        service.createCreative('adv-1', { name: 'X', type: 'HOLOGRAM' }),
      ).rejects.toThrow('Invalid creative type');
      expect(prisma.adCreative.create).not.toHaveBeenCalled();
    });
  });

  describe('listCreatives', () => {
    it('lists creatives scoped to the advertiser, newest-first', async () => {
      prisma.adCreative.findMany.mockResolvedValue([{ id: 'cr-2' }, { id: 'cr-1' }]);

      const result = await service.listCreatives('adv-1');

      expect(result).toHaveLength(2);
      expect(prisma.adCreative.findMany).toHaveBeenCalledWith({
        where: { advertiserId: 'adv-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getCreative', () => {
    it('returns the creative when owned by the advertiser', async () => {
      prisma.adCreative.findUnique.mockResolvedValue({ id: 'cr-1', advertiserId: 'adv-1' });

      const result = await service.getCreative('adv-1', 'cr-1');

      expect(result.id).toBe('cr-1');
    });

    it('throws CREATIVE_NOT_FOUND when missing (404)', async () => {
      prisma.adCreative.findUnique.mockResolvedValue(null);

      await expect(service.getCreative('adv-1', 'missing')).rejects.toThrow('Creative not found');
    });

    it('throws CREATIVE_FORBIDDEN for a cross-advertiser creative (403)', async () => {
      prisma.adCreative.findUnique.mockResolvedValue({ id: 'cr-1', advertiserId: 'adv-2' });

      await expect(service.getCreative('adv-1', 'cr-1')).rejects.toThrow(
        'Access denied for this creative',
      );
    });
  });

  describe('updateCreative', () => {
    it('updates only the provided fields after ownership check', async () => {
      prisma.adCreative.findUnique.mockResolvedValue({ id: 'cr-1', advertiserId: 'adv-1' });
      prisma.adCreative.update.mockResolvedValue({ id: 'cr-1', headline: 'New' });

      const result = await service.updateCreative('adv-1', 'cr-1', { headline: 'New' });

      expect(result.headline).toBe('New');
      expect(prisma.adCreative.update).toHaveBeenCalledWith({
        where: { id: 'cr-1' },
        data: { headline: 'New' },
      });
    });

    it('rejects update on a creative owned by another advertiser (403)', async () => {
      prisma.adCreative.findUnique.mockResolvedValue({ id: 'cr-1', advertiserId: 'adv-2' });

      await expect(service.updateCreative('adv-1', 'cr-1', { name: 'Hacked' })).rejects.toThrow(
        'Access denied for this creative',
      );
      expect(prisma.adCreative.update).not.toHaveBeenCalled();
    });

    it('throws INVALID_CREATIVE_TYPE for a bad type', async () => {
      prisma.adCreative.findUnique.mockResolvedValue({ id: 'cr-1', advertiserId: 'adv-1' });

      await expect(service.updateCreative('adv-1', 'cr-1', { type: 'NOPE' })).rejects.toThrow(
        'Invalid creative type',
      );
      expect(prisma.adCreative.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteCreative', () => {
    it('deletes after ownership check and returns { deleted: true }', async () => {
      prisma.adCreative.findUnique.mockResolvedValue({ id: 'cr-1', advertiserId: 'adv-1' });
      prisma.adCreative.delete.mockResolvedValue({ id: 'cr-1' });

      const result = await service.deleteCreative('adv-1', 'cr-1');

      expect(result).toEqual({ deleted: true });
      expect(prisma.adCreative.delete).toHaveBeenCalledWith({ where: { id: 'cr-1' } });
    });

    it('rejects delete on a creative owned by another advertiser (403)', async () => {
      prisma.adCreative.findUnique.mockResolvedValue({ id: 'cr-1', advertiserId: 'adv-2' });

      await expect(service.deleteCreative('adv-1', 'cr-1')).rejects.toThrow(
        'Access denied for this creative',
      );
      expect(prisma.adCreative.delete).not.toHaveBeenCalled();
    });

    it('throws CREATIVE_NOT_FOUND when deleting a missing creative (404)', async () => {
      prisma.adCreative.findUnique.mockResolvedValue(null);

      await expect(service.deleteCreative('adv-1', 'missing')).rejects.toThrow(
        'Creative not found',
      );
      expect(prisma.adCreative.delete).not.toHaveBeenCalled();
    });
  });
});
