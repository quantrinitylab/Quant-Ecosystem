// @vitest-environment node
// ============================================================================
// PlatformConfig -> consumer propagation (end-to-end, Req 9.2 "no restart")
// ============================================================================
//
// Proves that an owner PlatformConfig change reaches a REAL consuming service,
// not just the resolver adapter: CreditWallet.grantDaily, wired with
// createConfigDailyAllowanceProvider, grants exactly the owner-configured
// dailyFreeCredits — and a later owner change is reflected on the next grant
// without any restart.

import { describe, it, expect } from 'vitest';
import {
  PlatformConfigService,
  createConfigDailyAllowanceProvider,
  CreditWallet,
  type PlatformConfigRow,
} from '../index';

function createConfigPrisma() {
  const rows = new Map<string, PlatformConfigRow>();
  let n = 0;
  return {
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

interface LedgerRow {
  id: string;
  ownerRef: string;
  entryType: string;
  bucket: string;
  amount: number;
  actionKey: string | null;
  utcDay: string | null;
  createdAt: Date;
}

function createLedgerPrisma() {
  const rows: LedgerRow[] = [];
  let n = 0;
  return {
    creditLedgerEntry: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return (
          rows.find(
            (r) =>
              (where['ownerRef'] === undefined || r.ownerRef === where['ownerRef']) &&
              (where['entryType'] === undefined || r.entryType === where['entryType']) &&
              (where['utcDay'] === undefined || r.utcDay === where['utcDay']) &&
              (where['actionKey'] === undefined || r.actionKey === where['actionKey']),
          ) ?? null
        );
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return rows.filter(
          (r) => where['ownerRef'] === undefined || r.ownerRef === where['ownerRef'],
        );
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row: LedgerRow = {
          id: (data['id'] as string) ?? `e-${++n}`,
          ownerRef: data['ownerRef'] as string,
          entryType: data['entryType'] as string,
          bucket: data['bucket'] as string,
          amount: data['amount'] as number,
          actionKey: (data['actionKey'] as string | null) ?? null,
          utcDay: (data['utcDay'] as string | null) ?? null,
          createdAt: new Date(),
        };
        rows.push(row);
        return row;
      },
    },
  };
}

const OWNER = { principalId: 'owner-1', isPlatformOwner: true };
const ownerOnly = (p: { isPlatformOwner?: boolean }) => p.isPlatformOwner === true;

describe('PlatformConfig -> CreditWallet daily allowance propagation', () => {
  it('grantDaily reflects the owner-configured dailyFreeCredits, updating without restart', async () => {
    const configSvc = new PlatformConfigService(createConfigPrisma() as never, {
      writeAuthz: ownerOnly,
    });
    const wallet = new CreditWallet(createLedgerPrisma() as never, {
      dailyAllowanceProvider: createConfigDailyAllowanceProvider(configSvc),
    });

    // Owner sets the daily allowance centrally in QuantTrinity.
    await configSvc.setConfig(OWNER, { dailyFreeCredits: 250 });

    // The real consumer (CreditWallet.grantDaily) reflects it end-to-end.
    const day1 = await wallet.grantDaily({ ownerId: 'u1' }, '2026-06-30');
    expect(day1.entryType).toBe('daily_grant');
    expect(day1.amount).toBe(250);

    // Owner lowers the allowance — the next grant reflects it, no restart.
    await configSvc.setConfig(OWNER, { dailyFreeCredits: 50 });
    const day2 = await wallet.grantDaily({ ownerId: 'u1' }, '2026-07-01');
    expect(day2.amount).toBe(50);
  });
});
