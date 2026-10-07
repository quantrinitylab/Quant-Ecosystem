import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdSetService } from '../services/ad-set.service';

function createMockPrisma() {
  return {
    campaign: {
      findUnique: vi.fn(),
    },
    adSet: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
}

const OWNER = 'adv-1';
const CAMPAIGN_ID = 'camp-1';

function ownedCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN_ID,
    advertiserId: OWNER,
    deletedAt: null,
    ...overrides,
  };
}

describe('AdSetService', () => {
  let service: AdSetService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AdSetService(prisma as never);
  });

  describe('createAdSet', () => {
    it('creates a DRAFT ad set under an owned campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(ownedCampaign());
      prisma.adSet.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await service.createAdSet(OWNER, CAMPAIGN_ID, { name: 'Set A' });

      expect(result.status).toBe('DRAFT');
      expect(result.name).toBe('Set A');
      expect(result.campaignId).toBe(CAMPAIGN_ID);
      const createArgs = prisma.adSet.create.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(typeof createArgs.data['id']).toBe('string');
      expect((createArgs.data['id'] as string).length).toBeGreaterThan(0);
      expect(createArgs.data['status']).toBe('DRAFT');
      expect(createArgs.data['budget']).toEqual({});
      expect(createArgs.data['placement']).toEqual([]);
    });

    it('throws CAMPAIGN_NOT_FOUND (404) when campaign is missing', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.createAdSet(OWNER, 'missing', { name: 'Set A' })).rejects.toMatchObject({
        statusCode: 404,
        code: 'CAMPAIGN_NOT_FOUND',
      });
      expect(prisma.adSet.create).not.toHaveBeenCalled();
    });

    it('throws CAMPAIGN_NOT_FOUND (404) when campaign is soft-deleted', async () => {
      prisma.campaign.findUnique.mockResolvedValue(ownedCampaign({ deletedAt: new Date() }));

      await expect(
        service.createAdSet(OWNER, CAMPAIGN_ID, { name: 'Set A' }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'CAMPAIGN_NOT_FOUND' });
    });

    it('throws FORBIDDEN (403) when campaign belongs to another user', async () => {
      prisma.campaign.findUnique.mockResolvedValue(ownedCampaign({ advertiserId: 'other' }));

      await expect(
        service.createAdSet(OWNER, CAMPAIGN_ID, { name: 'Set A' }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      expect(prisma.adSet.create).not.toHaveBeenCalled();
    });
  });

  describe('listAdSets', () => {
    it('returns ad sets for an owned campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(ownedCampaign());
      prisma.adSet.findMany.mockResolvedValue([{ id: 'as-1' }, { id: 'as-2' }]);

      const result = await service.listAdSets(OWNER, CAMPAIGN_ID);

      expect(result).toHaveLength(2);
      expect(prisma.adSet.findMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('throws FORBIDDEN (403) for a campaign owned by another user', async () => {
      prisma.campaign.findUnique.mockResolvedValue(ownedCampaign({ advertiserId: 'other' }));

      await expect(service.listAdSets(OWNER, CAMPAIGN_ID)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });
  });

  describe('updateAdSet', () => {
    it('updates an ad set under an owned campaign', async () => {
      prisma.adSet.findUnique.mockResolvedValue({ id: 'as-1', campaignId: CAMPAIGN_ID });
      prisma.campaign.findUnique.mockResolvedValue(ownedCampaign());
      prisma.adSet.update.mockResolvedValue({ id: 'as-1', name: 'Renamed' });

      const result = await service.updateAdSet(OWNER, 'as-1', { name: 'Renamed' });

      expect(result.name).toBe('Renamed');
      expect(prisma.adSet.update).toHaveBeenCalledWith({
        where: { id: 'as-1' },
        data: { name: 'Renamed', updatedAt: expect.any(Date) },
      });
    });

    it('throws AD_SET_NOT_FOUND (404) when ad set is missing', async () => {
      prisma.adSet.findUnique.mockResolvedValue(null);

      await expect(service.updateAdSet(OWNER, 'missing', { name: 'X' })).rejects.toMatchObject({
        statusCode: 404,
        code: 'AD_SET_NOT_FOUND',
      });
      expect(prisma.adSet.update).not.toHaveBeenCalled();
    });

    it('throws FORBIDDEN (403) when ad set parent campaign is owned by another user', async () => {
      prisma.adSet.findUnique.mockResolvedValue({ id: 'as-1', campaignId: CAMPAIGN_ID });
      prisma.campaign.findUnique.mockResolvedValue(ownedCampaign({ advertiserId: 'other' }));

      await expect(service.updateAdSet(OWNER, 'as-1', { name: 'X' })).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });
  });

  describe('setStatus', () => {
    it('sets a valid status (PAUSED) on an owned ad set', async () => {
      prisma.adSet.findUnique.mockResolvedValue({ id: 'as-1', campaignId: CAMPAIGN_ID });
      prisma.campaign.findUnique.mockResolvedValue(ownedCampaign());
      prisma.adSet.update.mockResolvedValue({ id: 'as-1', status: 'PAUSED' });

      const result = await service.setStatus(OWNER, 'as-1', 'PAUSED');

      expect(result.status).toBe('PAUSED');
      expect(prisma.adSet.update).toHaveBeenCalledWith({
        where: { id: 'as-1' },
        data: { status: 'PAUSED', updatedAt: expect.any(Date) },
      });
    });

    it('sets ACTIVE status on an owned ad set', async () => {
      prisma.adSet.findUnique.mockResolvedValue({ id: 'as-1', campaignId: CAMPAIGN_ID });
      prisma.campaign.findUnique.mockResolvedValue(ownedCampaign());
      prisma.adSet.update.mockResolvedValue({ id: 'as-1', status: 'ACTIVE' });

      const result = await service.setStatus(OWNER, 'as-1', 'ACTIVE');

      expect(result.status).toBe('ACTIVE');
    });

    it('throws INVALID_STATUS (400) for an unknown status without touching the DB', async () => {
      await expect(service.setStatus(OWNER, 'as-1', 'BOGUS')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS',
      });
      expect(prisma.adSet.findUnique).not.toHaveBeenCalled();
      expect(prisma.adSet.update).not.toHaveBeenCalled();
    });

    it('throws AD_SET_NOT_FOUND (404) for a valid status on a missing ad set', async () => {
      prisma.adSet.findUnique.mockResolvedValue(null);

      await expect(service.setStatus(OWNER, 'missing', 'ACTIVE')).rejects.toMatchObject({
        statusCode: 404,
        code: 'AD_SET_NOT_FOUND',
      });
    });
  });

  describe('getAdSet', () => {
    it('returns an owned ad set', async () => {
      prisma.adSet.findUnique.mockResolvedValue({ id: 'as-1', campaignId: CAMPAIGN_ID });
      prisma.campaign.findUnique.mockResolvedValue(ownedCampaign());

      const result = await service.getAdSet(OWNER, 'as-1');

      expect(result.id).toBe('as-1');
    });
  });
});
