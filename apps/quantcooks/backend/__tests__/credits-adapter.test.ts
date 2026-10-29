// ============================================================================
// CP-2 — the credits adapter (§6.2 execution port + §6.5 orchestrator
// port) against a fake ledger prisma and the REAL @quant/credits wallet /
// gate. Pins the money invariants: a hold is not a charge, settle never
// exceeds the quote, failure releases in full, replays append nothing,
// and an unfunded reserve fails closed with no hold recorded.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { CreditWallet } from '@quant/credits';
import {
  buildCreditsExecutionPort,
  buildCreditsPort,
} from '../services/credits.adapter';
import {
  AutoEditOrchestrator,
  type AutoEditRunRow,
  type RenderPort,
  type PublishPort,
} from '../services/auto-edit-orchestrator.service';
import { RATE_TABLE } from '../tools/pricing';
import { createFakeCreditLedgerPrisma, debitedTotal } from './fake-credit-ledger-prisma';
import { expectCode } from './tools-test-rig';

const USER = 'user-1';

function setup() {
  const ledger = createFakeCreditLedgerPrisma();
  const prisma = { creditLedgerEntry: ledger.creditLedgerEntry };
  const wallet = new CreditWallet(prisma as never);
  const port = buildCreditsExecutionPort(prisma);
  if (!port) throw new Error('expected a configured port over the fake ledger');
  return { ledger, prisma, wallet, port };
}

async function seed(
  wallet: CreditWallet,
  amount: number,
  kind: 'purchase' | 'monthly_grant' = 'purchase',
  userId: string = USER,
): Promise<void> {
  await wallet.credit({ ownerId: userId }, { amount, kind });
}

describe('adapter construction — configured means a real ledger delegate', () => {
  it('returns null when there is no callable creditLedgerEntry delegate', () => {
    expect(buildCreditsExecutionPort(null)).toBeNull();
    expect(buildCreditsExecutionPort({})).toBeNull();
    expect(buildCreditsExecutionPort({ creditLedgerEntry: undefined })).toBeNull();
    // The @prisma/client stub shape: a bare function with no delegate
    // methods of its own (the Proxy test double) is NOT configured.
    expect(buildCreditsExecutionPort({ creditLedgerEntry: async () => [] })).toBeNull();
    expect(buildCreditsPort(null)).toBeNull();
    expect(buildCreditsPort({})).toBeNull();
  });

  it('builds both ports when the delegate is real', () => {
    const ledger = createFakeCreditLedgerPrisma();
    const prisma = { creditLedgerEntry: ledger.creditLedgerEntry };
    expect(buildCreditsExecutionPort(prisma)).not.toBeNull();
    expect(buildCreditsPort(prisma)).not.toBeNull();
  });
});

describe('CreditsExecutionPort — reserve → settle', () => {
  it('holds without charging, then settles exactly the quote', async () => {
    const { wallet, port, ledger } = setup();
    await seed(wallet, 100);

    const { reservationKey } = await port.reserve(USER, 'scope-1', 10);
    expect(reservationKey).toBe('quantcooks:job:scope-1');

    // A hold is not a charge: total untouched, 10 reported held.
    expect(await port.getBalance(USER)).toEqual({
      daily: 0,
      monthly: 0,
      purchased: 100,
      total: 100,
      held: 10,
    });
    expect(debitedTotal(ledger.rows, USER)).toBe(0);

    await port.settle('scope-1', 10);
    expect(await port.getBalance(USER)).toEqual({
      daily: 0,
      monthly: 0,
      purchased: 90,
      total: 90,
      held: 0,
    });
    expect(debitedTotal(ledger.rows, USER)).toBe(10);
  });

  it('never charges more than the quote, even if settle is handed an overrun', async () => {
    const { wallet, port, ledger } = setup();
    await seed(wallet, 100);
    await port.reserve(USER, 'scope-cap', 10);
    await port.settle('scope-cap', 999);
    expect((await port.getBalance(USER)).total).toBe(90);
    expect(debitedTotal(ledger.rows, USER)).toBe(10);
  });

  it('settles a measured actual below the quote at the actual', async () => {
    const { wallet, port } = setup();
    await seed(wallet, 100);
    await port.reserve(USER, 'scope-partial', 10);
    await port.settle('scope-partial', 4);
    const balance = await port.getBalance(USER);
    expect(balance.total).toBe(96);
    expect(balance.held).toBe(0);
  });

  it('double settle appends nothing (idempotent by reservation key)', async () => {
    const { wallet, port, ledger } = setup();
    await seed(wallet, 100);
    await port.reserve(USER, 'scope-twice', 10);
    await port.settle('scope-twice', 10);
    const rowsAfterFirst = ledger.rows.length;
    await port.settle('scope-twice', 10);
    expect(ledger.rows.length).toBe(rowsAfterFirst);
    expect((await port.getBalance(USER)).total).toBe(90);
  });

  it('replaying a reserve for the same scope holds once, not twice', async () => {
    const { wallet, port } = setup();
    await seed(wallet, 100);
    await port.reserve(USER, 'scope-replay', 10);
    await port.reserve(USER, 'scope-replay', 10);
    expect((await port.getBalance(USER)).held).toBe(10);
  });

  it('fails closed on insufficient balance: OUT_OF_CREDITS and no hold recorded', async () => {
    const { wallet, port } = setup();
    await seed(wallet, 5);
    await expectCode(port.reserve(USER, 'scope-poor', 10), 'OUT_OF_CREDITS', 402);
    const balance = await port.getBalance(USER);
    expect(balance.total).toBe(5);
    expect(balance.held).toBe(0);
  });

  it('rejects fractional amounts — whole credits only (§6.4)', async () => {
    const { wallet, port } = setup();
    await seed(wallet, 100);
    await expectCode(port.reserve(USER, 'scope-frac', 2.5), 'INVALID_AMOUNT', 400);
    expect((await port.getBalance(USER)).held).toBe(0);
  });

  it('settle on an unknown scope fails loudly (RESERVATION_NOT_FOUND)', async () => {
    const { port } = setup();
    await expectCode(port.settle('scope-ghost', 1), 'RESERVATION_NOT_FOUND', 404);
  });
});

describe('CreditsExecutionPort — failure releases in full', () => {
  it('release settles at 0: hold closes, balance untouched, no debit rows', async () => {
    const { wallet, port, ledger } = setup();
    await seed(wallet, 100);
    await port.reserve(USER, 'scope-fail', 10);
    await port.release('scope-fail');
    const balance = await port.getBalance(USER);
    expect(balance.total).toBe(100);
    expect(balance.held).toBe(0);
    expect(debitedTotal(ledger.rows, USER)).toBe(0);
  });

  it('release is idempotent and a later settle still charges nothing', async () => {
    const { wallet, port, ledger } = setup();
    await seed(wallet, 100);
    await port.reserve(USER, 'scope-fail-2', 10);
    await port.release('scope-fail-2');
    await port.release('scope-fail-2'); // no throw
    await port.settle('scope-fail-2', 10); // already settled at 0 — no-op
    expect((await port.getBalance(USER)).total).toBe(100);
    expect(debitedTotal(ledger.rows, USER)).toBe(0);
  });

  it('release of an unknown scope is a no-op (cleanup never masks errors)', async () => {
    const { port } = setup();
    await expect(port.release('scope-never-existed')).resolves.toBeUndefined();
  });

  it('held sums only the caller’s open reservations (owner isolation)', async () => {
    const { wallet, port } = setup();
    await seed(wallet, 100);
    await seed(wallet, 50, 'purchase', 'user-2');
    await port.reserve(USER, 'scope-a', 10);
    await port.reserve('user-2', 'scope-b', 7);
    expect((await port.getBalance(USER)).held).toBe(10);
    expect((await port.getBalance('user-2')).held).toBe(7);
    expect((await port.getBalance('user-2')).total).toBe(50);
  });
});

describe('buildCreditsPort — §6.5 the orchestrator’s debit port', () => {
  it('debits once per idempotency key; a replay appends nothing', async () => {
    const ledger = createFakeCreditLedgerPrisma();
    const prisma = { creditLedgerEntry: ledger.creditLedgerEntry };
    const wallet = new CreditWallet(prisma as never);
    await seed(wallet, 100);
    const credits = buildCreditsPort(prisma);
    if (!credits) throw new Error('expected a configured port');

    await credits.debit(USER, 10, 'auto-edit:run-1');
    expect(debitedTotal(ledger.rows, USER)).toBe(10);
    const rowsAfterFirst = ledger.rows.length;
    await credits.debit(USER, 10, 'auto-edit:run-1');
    expect(ledger.rows.length).toBe(rowsAfterFirst);
    expect(debitedTotal(ledger.rows, USER)).toBe(10);
  });

  it('propagates OUT_OF_CREDITS (402) when the wallet cannot fund the debit', async () => {
    const ledger = createFakeCreditLedgerPrisma();
    const prisma = { creditLedgerEntry: ledger.creditLedgerEntry };
    const wallet = new CreditWallet(prisma as never);
    await seed(wallet, 5);
    const credits = buildCreditsPort(prisma);
    if (!credits) throw new Error('expected a configured port');
    await expectCode(credits.debit(USER, 10, 'auto-edit:run-poor'), 'OUT_OF_CREDITS', 402);
    expect(debitedTotal(ledger.rows, USER)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §6.5 + spec §13: the orchestrator, wired exactly as routes/auto-edit.ts
// now wires it (buildCreditsPort + the rate table's flat 10), over a
// combined fake prisma. A successful run debits 10 once; a same-day
// replay debits nothing; an unfunded run fails at the meter step with
// creditsCharged: 0.
// ---------------------------------------------------------------------------

function createFakeAutoEditPrisma(ledger: ReturnType<typeof createFakeCreditLedgerPrisma>) {
  const runs = new Map<string, AutoEditRunRow>();
  let n = 0;
  const key = (userId: string, utcDay: string) => `${userId}::${utcDay}`;
  return {
    creditLedgerEntry: ledger.creditLedgerEntry,
    autoEditRun: {
      async findUnique({ where }: { where: { userId_utcDay: { userId: string; utcDay: string } } }) {
        return runs.get(key(where.userId_utcDay.userId, where.userId_utcDay.utcDay)) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        n += 1;
        const row = {
          id: String(data['id'] ?? `run-${n}`),
          userId: String(data['userId']),
          utcDay: String(data['utcDay']),
          status: String(data['status'] ?? 'running'),
          currentStep: 0,
          checkpoints: [],
          sourceRef: null,
          outputUrl: null,
          postId: null,
          creditsCharged: 0,
          error: null,
          startedAt: new Date(),
          finishedAt: null,
        } as unknown as AutoEditRunRow;
        runs.set(key(row.userId, row.utcDay), row);
        return row;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = [...runs.values()].find((r) => r.id === where.id);
        if (!row) throw new Error('run not found (fake P2025)');
        const updated = { ...row, ...data } as AutoEditRunRow;
        runs.set(key(updated.userId, updated.utcDay), updated);
        return updated;
      },
    },
  };
}

const goodRenderer: RenderPort = {
  render: async () => ({ ok: true, outputUrl: 'https://cdn.example/out.mp4' }),
};
const goodPublisher: PublishPort = { publish: async () => ({ ok: true, postId: 'post-1' }) };

describe('§6.5 wired orchestrator — auto-edit metering end to end', () => {
  function wiredOrchestrator(ledger: ReturnType<typeof createFakeCreditLedgerPrisma>) {
    const prisma = createFakeAutoEditPrisma(ledger);
    const rule = RATE_TABLE['quantcooks.run_auto_edit'];
    const creditsPerRun = rule && rule.type === 'flat' ? rule.credits : null;
    if (creditsPerRun === null) throw new Error('rate table must price run_auto_edit flat');
    return new AutoEditOrchestrator(prisma as never, {
      renderer: goodRenderer,
      publisher: goodPublisher,
      credits: buildCreditsPort(prisma) ?? undefined,
      creditsPerRun,
    });
  }

  it('a successful run debits exactly the rate-table 10, once', async () => {
    const ledger = createFakeCreditLedgerPrisma();
    const wallet = new CreditWallet({ creditLedgerEntry: ledger.creditLedgerEntry } as never);
    await seed(wallet, 100);
    const orchestrator = wiredOrchestrator(ledger);

    const summary = await orchestrator.runDaily(USER, {
      utcDay: '2026-10-29',
      sourceRef: 'asset-1',
    });
    expect(summary.status).toBe('completed');
    expect(summary.creditsCharged).toBe(10);
    expect(debitedTotal(ledger.rows, USER)).toBe(10);

    // Same-day replay returns the completed run — no second debit.
    const replay = await orchestrator.runDaily(USER, {
      utcDay: '2026-10-29',
      sourceRef: 'asset-1',
    });
    expect(replay.status).toBe('completed');
    expect(debitedTotal(ledger.rows, USER)).toBe(10);
  });

  it('an unfunded run fails at the meter step with creditsCharged: 0 and no debit', async () => {
    const ledger = createFakeCreditLedgerPrisma();
    const wallet = new CreditWallet({ creditLedgerEntry: ledger.creditLedgerEntry } as never);
    await seed(wallet, 5, 'purchase', 'user-poor');
    const orchestrator = wiredOrchestrator(ledger);

    const summary = await orchestrator.runDaily('user-poor', {
      utcDay: '2026-10-29',
      sourceRef: 'asset-1',
    });
    expect(summary.status).toBe('failed');
    expect(summary.creditsCharged).toBe(0);
    expect(summary.error).toContain('Insufficient credits');
    expect(summary.checkpoints.at(-1)).toMatchObject({ step: 'meter', status: 'failed' });
    expect(debitedTotal(ledger.rows, 'user-poor')).toBe(0);
  });
});
