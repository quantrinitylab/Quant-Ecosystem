// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageQuotaService } from '../services/storage-quota.service';

describe('CODEX PR #1558: owner-checked quota reservations', () => {
  const prisma: any = {
    file: { aggregate: async () => ({ _sum: { size: 0 } }) },
    userSubscription: { findUnique: async () => ({ tier: 'FREE' }) },
  };

  beforeEach(() => {
    StorageQuotaService.clearReservations();
  });

  it('committing another user’s reservation is 403 and the hold survives', async () => {
    const service = new StorageQuotaService(prisma);
    await service.reserveQuota('user-1', 1024, 'res-1', 3600_000);
    expect(() => service.commitReservation('res-1', 'user-2')).toThrowError();
    // Owner can still release it: the 403 did not consume the hold.
    expect(service.releaseReservation('res-1', 'user-1')).toBe(true);
  });

  it('releasing another user’s reservation is 403 and the hold survives', async () => {
    const service = new StorageQuotaService(prisma);
    await service.reserveQuota('user-1', 1024, 'res-2', 3600_000);
    expect(() => service.releaseReservation('res-2', 'user-2')).toThrowError();
    expect(service.getReservedUsage('user-1')).toBe(1024);
  });

  it('assertReservationOwner passes for the owner and for a missing (restart-lost) hold', () => {
    const service = new StorageQuotaService(prisma);
    expect(() => service.assertReservationOwner('no-such-reservation', 'user-1')).not.toThrow();
  });

  it('assertReservationOwner throws 403 for another user’s hold', async () => {
    const service = new StorageQuotaService(prisma);
    await service.reserveQuota('user-1', 1024, 'res-3', 3600_000);
    expect(() => service.assertReservationOwner('res-3', 'user-2')).toThrowError();
  });
});
