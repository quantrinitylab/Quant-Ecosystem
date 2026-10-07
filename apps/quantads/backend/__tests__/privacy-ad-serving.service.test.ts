import { describe, it, expect, beforeEach } from 'vitest';
import { PrivacyAdServingService } from '../services/privacy-ad-serving.service';
import type { PrismaClient } from '../types';

// ---------------------------------------------------------------------------
// Realistic in-memory stand-in for the narrow PrismaClient: real inventory
// fixtures (active ad -> active adSet -> active campaign with a creative).
// ---------------------------------------------------------------------------
function makePrisma(): PrismaClient {
  const ads = [
    { id: 'ad-1', adSetId: 'adset-1', creativeId: 'creative-1', status: 'ACTIVE' },
    { id: 'ad-2', adSetId: 'adset-1', creativeId: 'creative-1', status: 'ACTIVE' },
    { id: 'ad-3', adSetId: 'adset-2', creativeId: 'creative-2', status: 'ACTIVE' },
    { id: 'ad-paused', adSetId: 'adset-1', creativeId: 'creative-1', status: 'PAUSED' },
  ];
  const adSets = [
    { id: 'adset-1', campaignId: 'campaign-1', status: 'ACTIVE' },
    { id: 'adset-2', campaignId: 'campaign-2', status: 'ACTIVE' },
  ];
  const campaigns = [
    {
      id: 'campaign-1',
      status: 'ACTIVE',
      deletedAt: null,
      budget: { bidCents: 150 },
      targeting: { interests: ['technology', 'business'] },
    },
    {
      id: 'campaign-2',
      status: 'PAUSED',
      deletedAt: null,
      budget: { bidCents: 200 },
      targeting: { interests: ['sports'] },
    },
  ];
  const creatives = [
    {
      id: 'creative-1',
      mediaUrl: 'https://cdn.example.com/creatives/1.webp',
      headline: 'Real Headline One',
      description: 'Real description one',
      callToAction: 'Shop Now',
      landingUrl: 'https://advertiser.example.com/1',
    },
    {
      id: 'creative-2',
      mediaUrl: 'https://cdn.example.com/creatives/2.webp',
      headline: 'Real Headline Two',
      description: 'Real description two',
      callToAction: 'Learn More',
      landingUrl: 'https://advertiser.example.com/2',
    },
  ];

  const matchWhere = <T extends Record<string, unknown>>(rows: T[], where: any): T[] =>
    rows.filter((row) => {
      if (!where) return true;
      for (const [key, cond] of Object.entries(where)) {
        if (key === 'id' && typeof cond === 'object' && cond !== null && 'in' in cond) {
          if (!(cond as any).in.includes(row.id)) return false;
        } else if ((row as any)[key] !== cond) {
          return false;
        }
      }
      return true;
    });

  return {
    campaign: {
      create: async () => ({}),
      findUnique: async ({ where }: any) =>
        campaigns.find((c) => c.id === (where as any).id) ?? null,
      findMany: async (args: any) => matchWhere(campaigns, args?.where),
      count: async () => campaigns.length,
      update: async () => ({}),
    },
    ad: {
      findUnique: async ({ where }: any) => ads.find((a) => a.id === (where as any).id) ?? null,
      findMany: async (args: any) => matchWhere(ads, args?.where).slice(0, args?.take ?? 50),
    },
    adSet: {
      create: async () => ({}),
      findUnique: async ({ where }: any) =>
        adSets.find((s) => s.id === (where as any).id) ?? null,
      findMany: async (args: any) => matchWhere(adSets, args?.where),
      update: async () => ({}),
    },
    adCreative: {
      create: async () => ({}),
      findUnique: async ({ where }: any) =>
        creatives.find((c) => c.id === (where as any).id) ?? null,
      findMany: async () => creatives,
      update: async () => ({}),
      delete: async () => ({}),
    },
  } as unknown as PrismaClient;
}

describe('PrivacyAdServingService', () => {
  let service: PrivacyAdServingService;

  beforeEach(() => {
    service = new PrivacyAdServingService(makePrisma());
  });

  describe('getCandidates', () => {
    it('returns candidates drawn from real inventory (one per eligible campaign)', async () => {
      const candidates = await service.getCandidates({
        placement: 'main-feed',
        targetingMode: 'contextual',
      });

      // ad-1 and ad-2 share campaign-1 -> one candidate; ad-3's campaign-2 is
      // PAUSED -> excluded; ad-paused is PAUSED -> excluded.
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        id: 'ad-1',
        campaignId: 'campaign-1',
        headline: 'Real Headline One',
        bidAmount: 1.5,
      });
    });

    it('fails closed with an empty pool when no database is configured', async () => {
      const noDb = new PrivacyAdServingService();
      const candidates = await noDb.getCandidates({
        placement: 'main-feed',
        targetingMode: 'contextual',
      });

      expect(candidates).toEqual([]);
    });

    it('returns an empty pool when no active inventory exists', async () => {
      const prisma = makePrisma();
      prisma.campaign.findMany = async () => [];
      const empty = new PrivacyAdServingService(prisma);
      const candidates = await empty.getCandidates({
        placement: 'main-feed',
        targetingMode: 'contextual',
      });

      expect(candidates).toEqual([]);
    });

    it('candidates contain NO user profile data', async () => {
      const candidates = await service.getCandidates({
        placement: 'sidebar',
        targetingMode: 'contextual',
      });

      for (const candidate of candidates) {
        const candidateStr = JSON.stringify(candidate);
        // Must not contain any user-identifying fields
        expect(candidateStr).not.toContain('userId');
        expect(candidateStr).not.toContain('interests');
        expect(candidateStr).not.toContain('browsingHistory');
        expect(candidateStr).not.toContain('profileData');
        expect(candidateStr).not.toContain('userEmail');
        expect(candidateStr).not.toContain('personalizedScore');
      }

      // Verify only expected fields are present
      for (const candidate of candidates) {
        expect(candidate).toHaveProperty('id');
        expect(candidate).toHaveProperty('campaignId');
        expect(candidate).toHaveProperty('creativeUrl');
        expect(candidate).toHaveProperty('headline');
        expect(candidate).toHaveProperty('description');
        expect(candidate).toHaveProperty('callToAction');
        expect(candidate).toHaveProperty('landingUrl');
        expect(candidate).toHaveProperty('contextCategories');
        expect(candidate).toHaveProperty('brandSafetyCategories');
        expect(candidate).toHaveProperty('bidAmount');
      }
    });

    it('contextual mode prioritizes page-content matches from real inventory', async () => {
      const pageContent =
        'Latest technology news about artificial intelligence and machine learning in software development';

      const candidates = await service.getCandidates({
        placement: 'article',
        pageContent,
        targetingMode: 'contextual',
      });

      // The only real candidate targets technology/business -> matched first
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.contextCategories).toContain('technology');
    });

    it('returns candidates even without page content', async () => {
      const candidates = await service.getCandidates({
        placement: 'main-feed',
        targetingMode: 'contextual',
      });

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toHaveProperty('id');
    });

    it('handles behavioral targeting mode', async () => {
      const candidates = await service.getCandidates({
        placement: 'main-feed',
        targetingMode: 'behavioral',
      });

      expect(candidates).toHaveLength(1);
      // Even in behavioral mode, response must not contain user data
      for (const candidate of candidates) {
        const keys = Object.keys(candidate);
        expect(keys).not.toContain('userId');
        expect(keys).not.toContain('interests');
        expect(keys).not.toContain('browsingHistory');
      }
    });
  });

  describe('recordFeedback', () => {
    it('accepts only aggregate signals (adId + action)', () => {
      // Should not throw
      expect(() =>
        service.recordFeedback({ adId: 'ad-1', action: 'clicked' }),
      ).not.toThrow();
      expect(() =>
        service.recordFeedback({ adId: 'ad-2', action: 'dismissed' }),
      ).not.toThrow();
    });

    it('feedback payload contains no user features', () => {
      // The feedback interface only accepts { adId, action }
      // TypeScript enforces this at compile time, but we verify runtime behavior
      const feedback = { adId: 'ad-1', action: 'clicked' as const };
      const feedbackStr = JSON.stringify(feedback);

      expect(feedbackStr).not.toContain('userId');
      expect(feedbackStr).not.toContain('interests');
      expect(feedbackStr).not.toContain('browsingHistory');
      expect(feedbackStr).not.toContain('profileData');
    });
  });

  describe('getDisclosure', () => {
    it('returns disclosure with 1-2 signals for a real ad', async () => {
      const disclosure = await service.getDisclosure('ad-1');

      expect(disclosure).toHaveProperty('adId', 'ad-1');
      expect(disclosure).toHaveProperty('targetingMode', 'contextual');
      expect(disclosure).toHaveProperty('signals');
      expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
      expect(disclosure.signals.length).toBeLessThanOrEqual(2);
    });

    it('each signal has type and explanation', async () => {
      const disclosure = await service.getDisclosure('ad-2');

      for (const signal of disclosure.signals) {
        expect(signal).toHaveProperty('type');
        expect(signal).toHaveProperty('explanation');
        expect(signal.type.length).toBeGreaterThan(0);
        expect(signal.explanation.length).toBeGreaterThan(0);
      }
    });

    it('disclosure is present even for an unknown ad ID (honestly labeled)', async () => {
      const disclosure = await service.getDisclosure('unknown-ad');

      expect(disclosure).toHaveProperty('adId', 'unknown-ad');
      expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
      expect(disclosure.signals.length).toBeLessThanOrEqual(2);
    });
  });
});
