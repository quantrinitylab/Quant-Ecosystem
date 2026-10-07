import type { TransactionDirection } from '../types.js';

export interface LedgerEntry {
  id: string;
  userId: string;
  amount: number;
  direction: TransactionDirection;
  reason: string;
  idempotencyKey: string;
  timestamp: Date;
}

export class TransactionLedger {
  private entries: LedgerEntry[] = [];
  private keyIndex = new Set<string>();

  record(entry: Omit<LedgerEntry, 'id' | 'timestamp'>): LedgerEntry | null {
    if (this.keyIndex.has(entry.idempotencyKey)) {
      return null;
    }

    const ledgerEntry: LedgerEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };

    this.keyIndex.add(entry.idempotencyKey);
    this.entries.push(ledgerEntry);
    return ledgerEntry;
  }

  getByUser(userId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.userId === userId);
  }

  getByKey(idempotencyKey: string): LedgerEntry | undefined {
    return this.entries.find((e) => e.idempotencyKey === idempotencyKey);
  }

  getAll(): LedgerEntry[] {
    return [...this.entries];
  }
}
