import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import { byteEnv } from '../lib/env-bytes';

export type StorageTier = 'FREE' | 'STANDARD' | 'PREMIUM';

export interface TierInfo {
  limit: number;
  priceInCents: number;
}

const STANDARD_LIMIT_BYTES = 100 * 1024 ** 3;

export const STORAGE_TIERS: Record<StorageTier, TierInfo> = {
  FREE: {
    limit: byteEnv('DRIVE_QUOTA_BYTES', 15 * 1024 ** 3, STANDARD_LIMIT_BYTES),
    priceInCents: 0,
  },
  STANDARD: { limit: STANDARD_LIMIT_BYTES, priceInCents: 199 },
  PREMIUM: { limit: 2 * 1024 * 1024 * 1024 * 1024, priceInCents: 999 },
};

export interface QuotaReservation {
  id: string;
  userId: string;
  bytes: number;
  expiresAt: number;
}

export interface UserQuota {
  userId: string;
  tier: StorageTier;
  usedBytes: number;
  reservedBytes?: number;
  limitBytes: number;
  percentUsed: number;
}

export interface QuotaPrismaClient {
  file: {
    aggregate(args: Record<string, unknown>): Promise<{ _sum: { size: number | null } }>;
  };
  userSubscription: {
    findUnique(args: Record<string, unknown>): Promise<{ tier?: unknown } | null>;
    update(args: Record<string, unknown>): Promise<unknown>;
    create(args: Record<string, unknown>): Promise<unknown>;
  };
}

function isStorageTier(value: unknown): value is StorageTier {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STORAGE_TIERS, value);
}

export class StorageQuotaService {
  private static reservations = new Map<string, QuotaReservation>();

  constructor(private readonly prisma: QuotaPrismaClient) {}

  /**
   * Returns total uncommitted in-flight bytes reserved for this user.
   * Cleans up expired reservations lazily.
   */
  getReservedUsage(userId: string, excludeReservationId?: string): number {
    const now = Date.now();
    let total = 0;
    for (const [id, res] of StorageQuotaService.reservations.entries()) {
      if (res.expiresAt <= now) {
        StorageQuotaService.reservations.delete(id);
      } else if (res.userId === userId && id !== excludeReservationId) {
        total += res.bytes;
      }
    }
    return total;
  }

  async getUsage(userId: string): Promise<number> {
    const result = await this.prisma.file.aggregate({
      where: { userId, isDeleted: false },
      _sum: { size: true },
    });
    return result._sum.size ?? 0;
  }

  async getStorageTier(userId: string): Promise<StorageTier> {
    const subscription = await this.prisma.userSubscription.findUnique({
      where: { userId },
      select: { tier: true },
    });
    return isStorageTier(subscription?.tier) ? subscription.tier : 'FREE';
  }

  async getQuota(userId: string): Promise<UserQuota> {
    const [usedBytes, tier] = await Promise.all([
      this.getUsage(userId),
      this.getStorageTier(userId),
    ]);
    const reservedBytes = this.getReservedUsage(userId);
    const limitBytes = STORAGE_TIERS[tier].limit;
    const totalEffective = usedBytes + reservedBytes;
    return {
      userId,
      tier,
      usedBytes,
      reservedBytes,
      limitBytes,
      percentUsed: limitBytes > 0 ? (totalEffective / limitBytes) * 100 : 0,
    };
  }

  async checkQuota(
    userId: string,
    additionalBytes: number,
    excludeReservationId?: string,
  ): Promise<void> {
    const quota = await this.getQuota(userId);
    if (!Number.isFinite(quota.limitBytes) || quota.limitBytes <= 0) {
      throw createAppError('Storage quota is misconfigured', 500, 'INTERNAL_ERROR');
    }
    const reserved = this.getReservedUsage(userId, excludeReservationId);
    if (quota.usedBytes + reserved + additionalBytes > quota.limitBytes) {
      throw createAppError(
        'Storage quota exceeded. Please upgrade your plan.',
        507,
        'QUOTA_EXCEEDED',
      );
    }
  }

  /**
   * Atomically reserves quota for an upload or chunked upload session.
   * Prevents parallel uploads from bypassing the user's storage quota.
   */
  async reserveQuota(
    userId: string,
    additionalBytes: number,
    reservationId?: string,
    ttlMs: number = 3600000,
  ): Promise<{ reservationId: string; reservedBytes: number; quota: UserQuota }> {
    const id = reservationId ?? randomUUID();
    await this.checkQuota(userId, additionalBytes, id);
    const reservation: QuotaReservation = {
      id,
      userId,
      bytes: additionalBytes,
      expiresAt: Date.now() + ttlMs,
    };
    StorageQuotaService.reservations.set(id, reservation);
    const quota = await this.getQuota(userId);
    return { reservationId: id, reservedBytes: additionalBytes, quota };
  }

  /**
   * Releases a pending quota reservation (e.g., when an upload is aborted, fails, or expires).
   */
  releaseReservation(reservationId: string): boolean {
    return StorageQuotaService.reservations.delete(reservationId);
  }

  /**
   * Commits a reservation once file metadata is permanently persisted in the database.
   */
  commitReservation(reservationId: string): boolean {
    return StorageQuotaService.reservations.delete(reservationId);
  }

  /**
   * Clears all reservations (used in unit tests).
   */
  static clearReservations(): void {
    StorageQuotaService.reservations.clear();
  }

  async getQuotaLimit(userId: string): Promise<number> {
    return STORAGE_TIERS[await this.getStorageTier(userId)].limit;
  }

  async upgradeTier(userId: string, newTier: StorageTier): Promise<UserQuota> {
    const existing = await this.prisma.userSubscription.findUnique({ where: { userId } });
    if (existing) {
      await this.prisma.userSubscription.update({ where: { userId }, data: { tier: newTier } });
    } else {
      await this.prisma.userSubscription.create({ data: { userId, tier: newTier } });
    }
    return this.getQuota(userId);
  }
}
