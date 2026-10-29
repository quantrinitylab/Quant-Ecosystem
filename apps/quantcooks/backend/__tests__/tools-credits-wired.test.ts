// ============================================================================
// CP-2 — the credits tools with the real port wired: get_credit_balance /
// list_credit_history return REAL ledger state (the mirror image of
// tools-notconfigured.test.ts, which pins the port-absent refusal), the
// registry meters a flat-priced Tier A invoke end to end, and
// buildToolRegistry's CP-2 default builds the port from prisma when the
// ledger delegate exists.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { CreditWallet } from '@quant/credits';
import { buildCreditsExecutionPort } from '../services/credits.adapter';
import { buildToolRegistry } from '../tools/index';
import { createFakeCreditLedgerPrisma, debitedTotal } from './fake-credit-ledger-prisma';
import { createToolsTestRig, userCtx, USER, OTHER } from './tools-test-rig';

const fakeAi = {
  infer: async (req: { feature?: string }) => ({
    content:
      req.feature === 'captions'
        ? 'Golden, crispy, straight off the tawa.'
        : 'Biryani Nights\nSteam & Spice\nThe Dum Story',
    model: 'fake',
    provider: 'fake',
  }),
};

function wiredRig(ai?: unknown) {
  const ledger = createFakeCreditLedgerPrisma();
  const port = buildCreditsExecutionPort({ creditLedgerEntry: ledger.creditLedgerEntry });
  if (!port) throw new Error('expected a configured port over the fake ledger');
  const rig = createToolsTestRig({
    credits: port,
    ...(ai ? { ai } : {}),
  });
  // The history executor reads the ledger through deps.prisma (§6.2's
  // mapping) — hand the rig's prisma the same fake delegate production's
  // real client exposes.
  (rig.prisma as Record<string, unknown>)['creditLedgerEntry'] = ledger.creditLedgerEntry;
  const wallet = new CreditWallet({ creditLedgerEntry: ledger.creditLedgerEntry } as never);
  return { ledger, port, rig, wallet };
}

describe('credits tools with the port wired (CP-2)', () => {
  it('get_credit_balance returns the real derived buckets', async () => {
    const { rig, wallet } = wiredRig();
    await wallet.credit({ ownerId: USER }, { amount: 100, kind: 'purchase' });
    await wallet.credit({ ownerId: USER }, { amount: 50, kind: 'monthly_grant' });

    const result = await rig.registry.invoke('quantcooks.get_credit_balance', {}, userCtx());
    expect(result).toMatchObject({
      daily: 0,
      monthly: 50,
      purchased: 100,
      total: 150,
      held: 0,
    });
  });

  it('balance reflects holds: an open reservation shows as held, total uncharged', async () => {
    const { rig, wallet, port } = wiredRig();
    await wallet.credit({ ownerId: USER }, { amount: 100, kind: 'purchase' });
    await port.reserve(USER, 'invoke:held-check', 10);
    const result = await rig.registry.invoke('quantcooks.get_credit_balance', {}, userCtx());
    expect(result).toMatchObject({ total: 100, held: 10 });
  });

  it('list_credit_history returns the caller’s entries, newest first, with the total', async () => {
    const { rig, wallet } = wiredRig();
    await wallet.credit({ ownerId: USER }, { amount: 100, kind: 'purchase' });
    await wallet.credit({ ownerId: USER }, { amount: 50, kind: 'monthly_grant' });
    await wallet.credit({ ownerId: OTHER }, { amount: 7, kind: 'purchase' });

    const result = await rig.registry.invoke('quantcooks.list_credit_history', {}, userCtx());
    expect(result['total']).toBe(2);
    const entries = result['entries'] as { entryType: string; amount: number; bucket: string }[];
    expect(entries.map((e) => e.entryType)).toEqual(['monthly_grant', 'purchase']);
    expect(entries[0]).toMatchObject({ amount: 50, bucket: 'MONTHLY' });

    const page2 = await rig.registry.invoke(
      'quantcooks.list_credit_history',
      { page: 2, pageSize: 1 },
      userCtx(),
    );
    expect(page2['total']).toBe(2);
    expect((page2['entries'] as unknown[]).length).toBe(1);

    const other = await rig.registry.invoke(
      'quantcooks.list_credit_history',
      {},
      userCtx({ actorUserId: OTHER }),
    );
    expect(other['total']).toBe(1);
  });

  it('both credits tools report available in the catalogue once wired', async () => {
    const { rig } = wiredRig();
    for (const name of ['quantcooks.get_credit_balance', 'quantcooks.list_credit_history']) {
      const summary = rig.registry.summary(rig.registry.get(name));
      expect(summary.availability).toBe('available');
    }
  });

  it('a flat-priced invoke is metered end to end: quote 1 → settle 1, never more', async () => {
    const { rig, wallet, ledger } = wiredRig(fakeAi);
    await wallet.credit({ ownerId: USER }, { amount: 100, kind: 'purchase' });

    const result = await rig.registry.invoke(
      'quantcooks.suggest_titles',
      { description: 'A dum biryani film' },
      userCtx(),
    );
    expect(result['titles']).toEqual(['Biryani Nights', 'Steam & Spice', 'The Dum Story']);
    expect(result['metering']).toBe('metered');
    expect(result['creditCost']).toBe(1);
    expect(debitedTotal(ledger.rows, USER)).toBe(1);

    const balance = await rig.registry.invoke('quantcooks.get_credit_balance', {}, userCtx());
    expect(balance).toMatchObject({ total: 99, held: 0 });

    const history = await rig.registry.invoke('quantcooks.list_credit_history', {}, userCtx());
    const debit = (history['entries'] as { entryType: string; amount: number }[]).find(
      (e) => e.entryType === 'debit',
    );
    expect(debit?.amount).toBe(-1);
  });

  it('an unfunded flat-priced invoke refuses OUT_OF_CREDITS before the executor runs', async () => {
    const { rig, ledger } = wiredRig(fakeAi);
    // No seed at all: balance is 0, so the flat-1 title tool cannot
    // reserve — the executor (and its AI call) never runs.
    await expect(
      rig.registry.invoke('quantcooks.suggest_titles', { description: 'x' }, userCtx()),
    ).rejects.toMatchObject({ code: 'OUT_OF_CREDITS', statusCode: 402 });
    expect(debitedTotal(ledger.rows, USER)).toBe(0);
  });
});

describe('buildToolRegistry CP-2 default', () => {
  it('builds the real port from prisma when the credits option is not passed', async () => {
    const ledger = createFakeCreditLedgerPrisma();
    const rig = createToolsTestRig({ credits: null });
    (rig.prisma as Record<string, unknown>)['creditLedgerEntry'] = ledger.creditLedgerEntry;

    const { registry, deps } = buildToolRegistry({
      prisma: rig.prisma,
      storage: null,
      craftRunner: null,
      photoRunner: null,
    });
    expect(deps.credits).not.toBeNull();

    const wallet = new CreditWallet({ creditLedgerEntry: ledger.creditLedgerEntry } as never);
    await wallet.credit({ ownerId: USER }, { amount: 42, kind: 'purchase' });
    const result = await registry.invoke('quantcooks.get_credit_balance', {}, userCtx());
    expect(result).toMatchObject({ total: 42, purchased: 42 });
  });
});
