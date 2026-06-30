import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WithdrawSchedulerService,
  type AutoWithdrawSettingRow,
  type WithdrawSchedulerRunRow,
  type WithdrawPayoutPort,
} from '../withdraw-scheduler.service';

function setting(over: Partial<AutoWithdrawSettingRow> = {}): AutoWithdrawSettingRow {
  return {
    id: over.id ?? `s_${over.ownerRef ?? 'o'}`,
    ownerRef: over.ownerRef ?? 'owner-1',
    ownerType: over.ownerType ?? 'user',
    tenantId: over.tenantId ?? null,
    enabled: over.enabled ?? true,
    method: over.method ?? 'upi',
    destination: over.destination ?? 'vpa@bank',
    minThresholdCredits: over.minThresholdCredits ?? 100,
  };
}

function createFakePrisma(settings: AutoWithdrawSettingRow[]) {
  const runs = new Map<string, WithdrawSchedulerRunRow>();
  let seq = 0;
  return {
    runs,
    autoWithdrawSetting: {
      findMany: vi.fn(async (args: { where?: Record<string, unknown> }) => {
        const enabledOnly = args.where?.['enabled'] === true;
        return settings.filter((s) => (enabledOnly ? s.enabled : true));
      }),
    },
    withdrawSchedulerRun: {
      findUnique: async (args: { where: { utcDay: string } }) =>
        runs.get(args.where.utcDay) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        seq += 1;
        const row: WithdrawSchedulerRunRow = {
          id: String(args.data['id'] ?? `run-${seq}`),
          utcDay: String(args.data['utcDay']),
          status: String(args.data['status'] ?? 'running'),
          ownersConsidered: 0,
          withdrawn: 0,
          skipped: 0,
          failed: 0,
          error: null,
          startedAt: new Date(),
          finishedAt: null,
        };
        runs.set(row.utcDay, row);
        return row;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = [...runs.values()].find((r) => r.id === args.where.id)!;
        const updated = { ...row, ...args.data } as WithdrawSchedulerRunRow;
        runs.set(updated.utcDay, updated);
        return updated;
      },
    },
  };
}

describe('WithdrawSchedulerService', () => {
  let payouts: WithdrawPayoutPort & {
    getWithdrawable: ReturnType<typeof vi.fn>;
    requestWithdrawal: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    payouts = {
      getWithdrawable: vi.fn(async () => 0),
      requestWithdrawal: vi.fn(async () => ({})),
    };
  });

  it('rejects a malformed utcDay', async () => {
    const prisma = createFakePrisma([]);
    const svc = new WithdrawSchedulerService(prisma as never, payouts);
    await expect(svc.runDaily('2026/06/30')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('withdraws for opted-in owners above their threshold', async () => {
    const prisma = createFakePrisma([setting({ ownerRef: 'alice', minThresholdCredits: 100 })]);
    payouts.getWithdrawable.mockResolvedValue(250);
    const svc = new WithdrawSchedulerService(prisma as never, payouts, {
      generateId: () => 'run-1',
    });

    const summary = await svc.runDaily('2026-06-30');

    expect(summary).toMatchObject({ ownersConsidered: 1, withdrawn: 1, skipped: 0, failed: 0 });
    expect(payouts.requestWithdrawal).toHaveBeenCalledWith(
      { principalId: 'alice' },
      expect.objectContaining({ ownerId: 'alice' }),
      expect.objectContaining({ amountCredits: 250, method: 'upi', destination: 'vpa@bank' }),
    );
  });

  it('skips owners below their minimum threshold (no dust withdrawals)', async () => {
    const prisma = createFakePrisma([setting({ ownerRef: 'bob', minThresholdCredits: 100 })]);
    payouts.getWithdrawable.mockResolvedValue(40);
    const svc = new WithdrawSchedulerService(prisma as never, payouts);

    const summary = await svc.runDaily('2026-06-30');
    expect(summary).toMatchObject({ withdrawn: 0, skipped: 1 });
    expect(payouts.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('records a failure and continues the batch (fail-soft, no fabrication)', async () => {
    const prisma = createFakePrisma([setting({ ownerRef: 'alice' }), setting({ ownerRef: 'bob' })]);
    payouts.getWithdrawable.mockResolvedValue(200);
    payouts.requestWithdrawal
      .mockRejectedValueOnce(new Error('rail down'))
      .mockResolvedValueOnce({});
    const svc = new WithdrawSchedulerService(prisma as never, payouts);

    const summary = await svc.runDaily('2026-06-30');
    expect(summary).toMatchObject({ ownersConsidered: 2, withdrawn: 1, failed: 1 });
    expect(prisma.runs.get('2026-06-30')?.error).toBe('rail down');
  });

  it('is idempotent: a completed run for the day is not reprocessed', async () => {
    const prisma = createFakePrisma([setting({ ownerRef: 'alice' })]);
    payouts.getWithdrawable.mockResolvedValue(200);
    const svc = new WithdrawSchedulerService(prisma as never, payouts);

    await svc.runDaily('2026-06-30');
    expect(payouts.requestWithdrawal).toHaveBeenCalledTimes(1);

    // Second run for the same day must be a no-op.
    const again = await svc.runDaily('2026-06-30');
    expect(payouts.requestWithdrawal).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ withdrawn: 1 });
  });

  it('considers only enabled settings', async () => {
    const prisma = createFakePrisma([
      setting({ ownerRef: 'alice', enabled: true }),
      setting({ ownerRef: 'carol', enabled: false }),
    ]);
    payouts.getWithdrawable.mockResolvedValue(200);
    const svc = new WithdrawSchedulerService(prisma as never, payouts);

    const summary = await svc.runDaily('2026-06-30');
    expect(summary.ownersConsidered).toBe(1);
    expect(payouts.requestWithdrawal).toHaveBeenCalledTimes(1);
  });
});
