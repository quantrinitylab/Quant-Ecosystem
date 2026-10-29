// ============================================================================
// CP-2 test fake: an in-memory creditLedgerEntry delegate with the real
// delegate's semantics where the wallet depends on them — equality where
// matching, orderBy createdAt desc + skip/take (the history read), and a
// P2002 unique violation on a duplicate non-null actionKey (the ledger's
// idempotency backstop). createdAt is a deterministic tick clock so
// newest-first ordering is testable without sleeping.
// ============================================================================

export interface FakeLedgerRow {
  id: string;
  ownerRef: string;
  ownerType: string;
  tenantId: string | null;
  entryType: string;
  bucket: string;
  amount: number;
  actionKey: string | null;
  sourceRef: string | null;
  utcDay: string | null;
  reason: string | null;
  createdAt: Date;
}

export function createFakeCreditLedgerPrisma() {
  const rows: FakeLedgerRow[] = [];
  let tick = 0;

  const matches = (row: FakeLedgerRow, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([key, expected]) => (row as unknown as Record<string, unknown>)[key] === expected);

  const delegate = {
    rows,
    async findMany(args: Record<string, unknown> = {}): Promise<FakeLedgerRow[]> {
      const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
      let out = rows.filter((r) => matches(r, where));
      const orderBy = args['orderBy'] as { createdAt?: string } | undefined;
      if (orderBy?.createdAt === 'desc') {
        out = [...out].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (typeof args['skip'] === 'number') out = out.slice(args['skip'] as number);
      if (typeof args['take'] === 'number') out = out.slice(0, args['take'] as number);
      return out.map((r) => ({ ...r }));
    },
    async findFirst(args: Record<string, unknown> = {}): Promise<FakeLedgerRow | null> {
      const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
      const found = rows.find((r) => matches(r, where));
      return found ? { ...found } : null;
    },
    async count(args: Record<string, unknown> = {}): Promise<number> {
      const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
      return rows.filter((r) => matches(r, where)).length;
    },
    async create({ data }: { data: Record<string, unknown> }): Promise<FakeLedgerRow> {
      const actionKey = (data['actionKey'] as string | null | undefined) ?? null;
      if (actionKey !== null && rows.some((r) => r.actionKey === actionKey)) {
        const err = new Error('Unique constraint failed on the fields: (`actionKey`)') as Error & {
          code?: string;
        };
        err.code = 'P2002';
        throw err;
      }
      tick += 1;
      const row = {
        tenantId: null,
        sourceRef: null,
        utcDay: null,
        reason: null,
        ...data,
        createdAt: new Date(Date.UTC(2026, 9, 29, 0, 0, tick)),
      } as unknown as FakeLedgerRow;
      rows.push(row);
      return { ...row };
    },
  };

  return { creditLedgerEntry: delegate, rows };
}

export type FakeCreditLedgerPrisma = ReturnType<typeof createFakeCreditLedgerPrisma>;

/** Sum of an owner's debit entries (negative amounts) as a positive total. */
export function debitedTotal(rows: FakeLedgerRow[], ownerRef: string): number {
  return rows
    .filter((r) => r.ownerRef === ownerRef && r.entryType === 'debit')
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
}
