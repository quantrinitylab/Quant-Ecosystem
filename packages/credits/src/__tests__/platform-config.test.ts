// @vitest-environment node
// ============================================================================
// PlatformConfigService — owner-controlled, persisted credit/economy config
// ============================================================================
//
// Verifies Req 9 / 6.5:
//   * getConfig seeds defaults on first read and returns persisted values.
//   * setConfig requires the owner/admin predicate (fail closed by default) and
//     validates bounds.
//   * the daily-allowance adapter reflects the persisted config.

import { describe, it, expect } from 'vitest';
import {
  PlatformConfigService,
  DEFAULT_PLATFORM_CONFIG,
  createConfigDailyAllowanceProvider,
  resolveCommissionRate,
  resolveUsdPerCredit,
  type PlatformConfigRow,
} from '../index';

function createConfigPrisma() {
  const rows = new Map<string, PlatformConfigRow>();
  let n = 0;
  return {
    _rows: rows,
    platformConfig: {
      async findUnique({ where }: { where: { scope: string } }) {
        return rows.get(where.scope) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row = {
          id: (data.id as string) ?? `cfg-${++n}`,
          scope: (data.scope as string) ?? 'global',
          usdPerCredit: (data.usdPerCredit as number) ?? 1,
          dailyFreeCredits: (data.dailyFreeCredits as number) ?? 100,
          commissionRate: (data.commissionRate as number) ?? 0.2,
          overageEnabledDefault: (data.overageEnabledDefault as boolean) ?? false,
          updatedBy: (data.updatedBy as string | null) ?? null,
        } satisfies PlatformConfigRow;
        rows.set(row.scope, row);
        return { ...row };
      },
      async update({ where, data }: { where: { scope: string }; data: Record<string, unknown> }) {
        const existing = rows.get(where.scope);
        if (!existing) throw new Error('not found');
        const updated = { ...existing, ...data } as PlatformConfigRow;
        rows.set(where.scope, updated);
        return { ...updated };
      },
    },
  };
}

const OWNER = { principalId: 'owner-1', isPlatformOwner: true };
const ownerOnly = (p: { isPlatformOwner?: boolean }) => p.isPlatformOwner === true;

describe('PlatformConfigService', () => {
  it('seeds defaults on first read', async () => {
    const prisma = createConfigPrisma();
    const svc = new PlatformConfigService(prisma as never, { generateId: () => 'cfg' });
    const cfg = await svc.getConfig();
    expect(cfg).toEqual(DEFAULT_PLATFORM_CONFIG);
    // The defaults row is now persisted (subsequent reads do not re-create).
    expect(prisma._rows.size).toBe(1);
    await svc.getConfig();
    expect(prisma._rows.size).toBe(1);
  });

  it('applies an owner patch and persists it', async () => {
    const prisma = createConfigPrisma();
    const svc = new PlatformConfigService(prisma as never, {
      writeAuthz: ownerOnly,
      generateId: () => 'cfg',
    });
    const updated = await svc.setConfig(OWNER, { dailyFreeCredits: 50, commissionRate: 0.3 });
    expect(updated.dailyFreeCredits).toBe(50);
    expect(updated.commissionRate).toBe(0.3);
    expect((await svc.getConfig()).dailyFreeCredits).toBe(50);
  });

  it('denies a non-owner (fail closed) and rejects out-of-bounds values', async () => {
    const prisma = createConfigPrisma();
    const svc = new PlatformConfigService(prisma as never, { writeAuthz: ownerOnly });
    await expect(
      svc.setConfig({ principalId: 'mallory' }, { dailyFreeCredits: 1 }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    await expect(svc.setConfig(OWNER, { commissionRate: 1 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_CONFIG',
    });
    await expect(svc.setConfig(OWNER, {})).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_CONFIG',
    });
  });

  it('defaults to deny-all writes when no predicate is wired', async () => {
    const prisma = createConfigPrisma();
    const svc = new PlatformConfigService(prisma as never);
    await expect(svc.setConfig(OWNER, { dailyFreeCredits: 10 })).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('adapters reflect persisted config', async () => {
    const prisma = createConfigPrisma();
    const svc = new PlatformConfigService(prisma as never, { writeAuthz: ownerOnly });
    await svc.setConfig(OWNER, { dailyFreeCredits: 25, commissionRate: 0.15 });
    const allowance = createConfigDailyAllowanceProvider(svc);
    expect(await allowance()).toBe(25);
    expect(await resolveCommissionRate(svc)).toBe(0.15);
  });

  it('propagates an owner usdPerCredit change to the pricing consumer without restart', async () => {
    const prisma = createConfigPrisma();
    const svc = new PlatformConfigService(prisma as never, { writeAuthz: ownerOnly });

    // The pricing/top-up path resolves the credit value live through the same
    // service instance, so an owner change must be visible on the next read.
    expect(await resolveUsdPerCredit(svc)).toBe(DEFAULT_PLATFORM_CONFIG.usdPerCredit);

    await svc.setConfig(OWNER, { usdPerCredit: 2.5 });
    expect(await resolveUsdPerCredit(svc)).toBe(2.5);

    await svc.setConfig(OWNER, { usdPerCredit: 0.75 });
    expect(await resolveUsdPerCredit(svc)).toBe(0.75);
  });
});
