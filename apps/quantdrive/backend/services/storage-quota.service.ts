import { createAppError } from '@quant/server-core';

/** Minimal PrismaClient interface for dependency injection */
export interface PrismaClient {
  file: {
    aggregate: (args: Record<string, unknown>) => Promise<{ _sum: { size: number | null } }>;
  };
  userSubscription: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<unknown>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
}

export type StorageTier = 'FREE' | 'STANDARD' | 'PREMIUM';

export interface TierInfo {
  limit: number;
  priceInCents: number;
}

export const STORAGE_TIERS: Record<StorageTier, TierInfo> = {
  FREE: { limit: 15 * 1024 * 1024 * 1024, priceInCents: 0 },
  STANDARD: { limit: 100 * 1024 * 1024 * 1024, priceInCents: 199 },
  PREMIUM: { limit: 2 * 1024 * 1024 * 1024 * 1024, priceInCents: 999 },
};

export interface UserQuota {
  userId: string;
  tier: StorageTier;
  usedBytes: number;
  limitBytes: number;
  percentUsed: number;
}

interface SubscriptionRecord {
  userId: string;
  tier: StorageTier;
}

export class StorageQuotaService {
  constructor(private readonly prisma: PrismaClient) {}

  async getUsage(userId: string): Promise<number> {
    const result = await this.prisma.file.aggregate({
      where: { userId, isDeleted: false },
      _sum: { size: true },
    });

    return result._sum.size ?? 0;
  }

  async checkQuota(userId: string, additionalBytes: number): Promise<void> {
    const usage = await this.getUsage(userId);
    const tier = await this.getStorageTier(userId);
    const limit = STORAGE_TIERS[tier].limit;

    if (usage + additionalBytes > limit) {
      throw createAppError(
        'Storage quota exceeded. Please upgrade your plan.',
        403,
        'QUOTA_EXCEEDED',
      );
    }
  }

  async getStorageTier(userId: string): Promise<StorageTier> {
    const subscription = await this.prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      return 'FREE';
    }

    return (subscription as unknown as SubscriptionRecord).tier;
  }

  async upgradeTier(userId: string, newTier: StorageTier): Promise<UserQuota> {
    const existing = await this.prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (existing) {
      await this.prisma.userSubscription.update({
        where: { userId },
        data: { tier: newTier },
      });
    } else {
      await this.prisma.userSubscription.create({
        data: { userId, tier: newTier },
      });
    }

    const usedBytes = await this.getUsage(userId);
    const limitBytes = STORAGE_TIERS[newTier].limit;

    return {
      userId,
      tier: newTier,
      usedBytes,
      limitBytes,
      percentUsed: limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0,
    };
  }
}
