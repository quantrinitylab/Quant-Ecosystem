// @vitest-environment node
// ============================================================================
// quantmail-superhub · OverageService — per-owner overage opt-in policy
// ============================================================================
//
// Verifies the "no surprise charges" rule:
//   * default is OFF — no row => OVERAGE_DISABLED (enabled:false, limit:0).
//   * setPolicy upserts (enable + ceiling), getPolicy reads it back.
//   * a negative/fractional ceiling is rejected (INVALID_OVERAGE_LIMIT).
//   * authz: a non-owner / non-tenant-admin is denied 403 on read and write.
//   * the OveragePolicyPort default is permanently OFF, and the service-backed
//     port resolves the owner's policy by string ownerRef.

import { describe, it, expect } from 'vitest';
import {
  OverageService,
  OVERAGE_DISABLED,
  overageDisabledPort,
  createOveragePolicyPort,
} from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

interface OverageRow {
  id: string;
  ownerRef: string;
  ownerType: string;
  tenantId: string | null;
  enabled: boolean;
  monthlyLimitCredits: number;
  createdAt: Date;
  updatedAt: Date;
}

function createOveragePrisma() {
  const rows = new Map<string, OverageRow>();
  let n = 0;
  return {
    _rows: rows,
    overageSetting: {
      async findUnique({ where }: { where: { ownerRef: string } }): Promise<OverageRow | null> {
        return rows.get(where.ownerRef) ?? null;
      },
      async upsert({
        where,
        update,
        create,
      }: {
        where: { ownerRef: string };
        update: Partial<OverageRow>;
        create: Omit<OverageRow, 'createdAt' | 'updatedAt'> & Partial<OverageRow>;
      }): Promise<OverageRow> {
        const existing = rows.get(where.ownerRef);
        if (existing) {
          const next = { ...existing, ...update, updatedAt: new Date() };
          rows.set(where.ownerRef, next);
          return { ...next };
        }
        const row: OverageRow = {
          id: create.id ?? `ov-${++n}`,
          ownerRef: create.ownerRef,
          ownerType: create.ownerType ?? 'user',
          tenantId: create.tenantId ?? null,
          enabled: create.enabled ?? false,
          monthlyLimitCredits: create.monthlyLimitCredits ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rows.set(where.ownerRef, row);
        return { ...row };
      },
    },
  };
}

const OWNER = { ownerId: 'alice', ownerType: 'user' as const, tenantId: 'tenant-A' };
const ALICE: OwnershipPrincipal = { principalId: 'alice', tenantId: 'tenant-A' };
const MALLORY: OwnershipPrincipal = { principalId: 'mallory', tenantId: 'tenant-B' };
const ids = () => {
  let i = 0;
  return () => `id-${++i}`;
};

describe('OverageService — default OFF', () => {
  it('returns OVERAGE_DISABLED when no policy row exists', async () => {
    const prisma = createOveragePrisma();
    const svc = new OverageService(prisma as never, { generateId: ids() });
    const policy = await svc.getPolicy(ALICE, OWNER);
    expect(policy).toEqual({ enabled: false, monthlyLimitCredits: 0 });
    expect(OVERAGE_DISABLED.enabled).toBe(false);
  });
});

describe('OverageService — setPolicy/getPolicy', () => {
  it('enables overage with a ceiling and reads it back (upsert)', async () => {
    const prisma = createOveragePrisma();
    const svc = new OverageService(prisma as never, { generateId: ids() });

    const set = await svc.setPolicy(ALICE, OWNER, { enabled: true, monthlyLimitCredits: 500 });
    expect(set).toEqual({ enabled: true, monthlyLimitCredits: 500 });

    const got = await svc.getPolicy(ALICE, OWNER);
    expect(got).toEqual({ enabled: true, monthlyLimitCredits: 500 });

    // Update the same owner's policy (no duplicate row).
    await svc.setPolicy(ALICE, OWNER, { enabled: false });
    expect(await svc.getPolicy(ALICE, OWNER)).toEqual({ enabled: false, monthlyLimitCredits: 0 });
    expect(prisma._rows.size).toBe(1);
  });

  it('rejects a negative or fractional ceiling', async () => {
    const prisma = createOveragePrisma();
    const svc = new OverageService(prisma as never, { generateId: ids() });
    for (const bad of [-1, 1.5, Number.NaN]) {
      await expect(
        svc.setPolicy(ALICE, OWNER, { enabled: true, monthlyLimitCredits: bad as number }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_OVERAGE_LIMIT' });
    }
  });
});

describe('OverageService — authz', () => {
  it('denies a non-owner on read and write with 403', async () => {
    const prisma = createOveragePrisma();
    const svc = new OverageService(prisma as never, { generateId: ids() });
    await expect(svc.getPolicy(MALLORY, OWNER)).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      svc.setPolicy(MALLORY, OWNER, { enabled: true, monthlyLimitCredits: 10 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('OveragePolicyPort', () => {
  it('the disabled port is permanently OFF', async () => {
    expect(await overageDisabledPort.getPolicy('anyone')).toEqual({
      enabled: false,
      monthlyLimitCredits: 0,
    });
  });

  it('the service-backed port resolves a policy by string ownerRef', async () => {
    const prisma = createOveragePrisma();
    const svc = new OverageService(prisma as never, { generateId: ids() });
    // Owner reads its OWN policy via the default resolvers.
    await svc.setPolicy(
      { principalId: 'bob' },
      { ownerId: 'bob' },
      {
        enabled: true,
        monthlyLimitCredits: 42,
      },
    );
    const port = createOveragePolicyPort(svc);
    expect(await port.getPolicy('bob')).toEqual({ enabled: true, monthlyLimitCredits: 42 });
    expect(await port.getPolicy('nobody')).toEqual({ enabled: false, monthlyLimitCredits: 0 });
  });
});
