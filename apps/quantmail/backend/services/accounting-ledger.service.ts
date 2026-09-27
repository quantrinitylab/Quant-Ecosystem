// ============================================================================
// QuantMail & ERPGo — Double-Entry General Ledger & Chart of Accounts Service
// ============================================================================

import { randomUUID } from 'crypto';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Account {
  id: string;
  workspaceId: string;
  code: string; // e.g. "1010" Cash, "4010" Sales Revenue
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
}

export interface JournalItem {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntry {
  id: string;
  workspaceId: string;
  reference: string;
  entryDate: string;
  description: string;
  items: JournalItem[];
  totalAmount: number;
  createdAt: string;
}

export interface TrialBalanceReport {
  workspaceId: string;
  asOfDate: string;
  accounts: Array<{
    code: string;
    name: string;
    type: AccountType;
    debit: number;
    credit: number;
  }>;
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

export class AccountingLedgerService {
  private accounts = new Map<string, Account>();
  private journalEntries = new Map<string, JournalEntry[]>();

  constructor(private prisma?: any) {}

  /**
   * Creates a new Chart of Accounts account in the specified workspace.
   */
  public createAccount(
    workspaceId: string,
    data: Omit<Account, 'id' | 'workspaceId' | 'balance'>,
  ): Account {
    if (!workspaceId) {
      throw new Error('WORKSPACE_ID_REQUIRED: workspaceId is required to create an account.');
    }
    if (!data.code || !data.code.trim()) {
      throw new Error('ACCOUNT_CODE_REQUIRED: account code cannot be empty.');
    }
    if (!data.name || !data.name.trim()) {
      throw new Error('ACCOUNT_NAME_REQUIRED: account name cannot be empty.');
    }

    const id = `acc_${randomUUID()}`;
    const account: Account = {
      id,
      workspaceId,
      code: data.code.trim(),
      name: data.name.trim(),
      type: data.type,
      currency: data.currency ? data.currency.toUpperCase() : 'USD',
      balance: 0,
    };

    this.accounts.set(id, account);
    return { ...account };
  }

  /**
   * Retrieves an account by its unique ID.
   */
  public getAccount(accountId: string): Account | undefined {
    const acc = this.accounts.get(accountId);
    return acc ? { ...acc } : undefined;
  }

  /**
   * Retrieves all accounts registered under a workspace.
   */
  public getAccounts(workspaceId: string): Account[] {
    return Array.from(this.accounts.values())
      .filter((a) => a.workspaceId === workspaceId)
      .map((a) => ({ ...a }));
  }

  /**
   * Records a balanced double-entry journal entry and atomically updates account balances.
   * Invariant: SUM(debits) === SUM(credits) (rounded to 2 decimal places).
   */
  public recordJournalEntry(
    workspaceId: string,
    data: {
      reference: string;
      entryDate?: string;
      description: string;
      items: JournalItem[];
    },
  ): JournalEntry {
    if (!workspaceId) {
      throw new Error('WORKSPACE_ID_REQUIRED: workspaceId is required to record a journal entry.');
    }
    if (!data.items || data.items.length === 0) {
      throw new Error('UNBALANCED_JOURNAL_ENTRY');
    }

    // 1. Validate debits and credits math (rounded to 2 decimal places)
    let totalDebits = 0;
    let totalCredits = 0;

    for (const item of data.items) {
      const debit = Number((item.debit || 0).toFixed(2));
      const credit = Number((item.credit || 0).toFixed(2));
      if (debit < 0 || credit < 0) {
        throw new Error('NEGATIVE_AMOUNT: Debits and credits must be non-negative numbers.');
      }
      totalDebits += debit;
      totalCredits += credit;
    }

    totalDebits = Number(totalDebits.toFixed(2));
    totalCredits = Number(totalCredits.toFixed(2));

    // Must be balanced and greater than zero
    if (totalDebits !== totalCredits || totalDebits === 0) {
      throw new Error('UNBALANCED_JOURNAL_ENTRY');
    }

    // 2. Validate all account IDs exist and belong to the workspace
    for (const item of data.items) {
      const account = this.accounts.get(item.accountId);
      if (!account) {
        throw new Error(`ACCOUNT_NOT_FOUND: Account with id '${item.accountId}' was not found.`);
      }
      if (account.workspaceId !== workspaceId) {
        throw new Error(
          `WORKSPACE_MISMATCH: Account '${item.accountId}' does not belong to workspace '${workspaceId}'.`,
        );
      }
    }

    // 3. Atomically update account balances according to standard normal balance rules:
    // - Assets & Expenses: Balance increases with debit, decreases with credit.
    // - Liabilities, Equity, Revenue: Balance increases with credit, decreases with debit.
    for (const item of data.items) {
      const account = this.accounts.get(item.accountId)!;
      const debit = Number((item.debit || 0).toFixed(2));
      const credit = Number((item.credit || 0).toFixed(2));

      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        account.balance = Number((account.balance + debit - credit).toFixed(2));
      } else {
        // LIABILITY, EQUITY, REVENUE
        account.balance = Number((account.balance + credit - debit).toFixed(2));
      }
    }

    // 4. Save and index Journal Entry
    const entry: JournalEntry = {
      id: `je_${randomUUID()}`,
      workspaceId,
      reference: data.reference,
      entryDate: data.entryDate || new Date().toISOString().split('T')[0],
      description: data.description,
      items: data.items.map((it) => ({
        accountId: it.accountId,
        debit: Number((it.debit || 0).toFixed(2)),
        credit: Number((it.credit || 0).toFixed(2)),
        description: it.description,
      })),
      totalAmount: totalDebits,
      createdAt: new Date().toISOString(),
    };

    const entries = this.journalEntries.get(workspaceId) || [];
    entries.push(entry);
    this.journalEntries.set(workspaceId, entries);

    return {
      ...entry,
      items: entry.items.map((i) => ({ ...i })),
    };
  }

  /**
   * Generates a Trial Balance summary report for the workspace.
   * Shows account codes, names, types, and respective debit or credit balances.
   * Verifies totalDebits === totalCredits and reports isBalanced: true.
   */
  public generateTrialBalance(workspaceId: string): TrialBalanceReport {
    const wsAccounts = Array.from(this.accounts.values())
      .filter((a) => a.workspaceId === workspaceId)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

    const reportAccounts = wsAccounts.map((account) => {
      let debit = 0;
      let credit = 0;

      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        if (account.balance >= 0) {
          debit = account.balance;
          credit = 0;
        } else {
          debit = 0;
          credit = Math.abs(account.balance);
        }
      } else {
        // LIABILITY, EQUITY, REVENUE
        if (account.balance >= 0) {
          debit = 0;
          credit = account.balance;
        } else {
          debit = Math.abs(account.balance);
          credit = 0;
        }
      }

      return {
        code: account.code,
        name: account.name,
        type: account.type,
        debit: Number(debit.toFixed(2)),
        credit: Number(credit.toFixed(2)),
      };
    });

    const totalDebits = Number(reportAccounts.reduce((sum, a) => sum + a.debit, 0).toFixed(2));
    const totalCredits = Number(reportAccounts.reduce((sum, a) => sum + a.credit, 0).toFixed(2));
    const isBalanced = totalDebits === totalCredits;

    return {
      workspaceId,
      asOfDate: new Date().toISOString().split('T')[0],
      accounts: reportAccounts,
      totalDebits,
      totalCredits,
      isBalanced,
    };
  }

  /**
   * Retrieves all journal entries recorded for the workspace.
   */
  public getJournalEntries(workspaceId: string): JournalEntry[] {
    const entries = this.journalEntries.get(workspaceId) || [];
    return entries.map((e) => ({
      ...e,
      items: e.items.map((i) => ({ ...i })),
    }));
  }

  /**
   * Clears in-memory ledger stores for test isolation.
   */
  public clearLedgerForTesting(): void {
    this.accounts.clear();
    this.journalEntries.clear();
  }
}

// Global Singleton Instance
export const accountingLedgerService = new AccountingLedgerService();

// Standalone functions delegating to the singleton instance for seamless import
export function createAccount(
  workspaceId: string,
  data: Omit<Account, 'id' | 'workspaceId' | 'balance'>,
): Account {
  return accountingLedgerService.createAccount(workspaceId, data);
}

export function recordJournalEntry(
  workspaceId: string,
  data: {
    reference: string;
    entryDate?: string;
    description: string;
    items: JournalItem[];
  },
): JournalEntry {
  return accountingLedgerService.recordJournalEntry(workspaceId, data);
}

export function generateTrialBalance(workspaceId: string): TrialBalanceReport {
  return accountingLedgerService.generateTrialBalance(workspaceId);
}

export function getJournalEntries(workspaceId: string): JournalEntry[] {
  return accountingLedgerService.getJournalEntries(workspaceId);
}

export function clearLedgerForTesting(): void {
  accountingLedgerService.clearLedgerForTesting();
}

export function getAccount(accountId: string): Account | undefined {
  return accountingLedgerService.getAccount(accountId);
}

export function getAccounts(workspaceId: string): Account[] {
  return accountingLedgerService.getAccounts(workspaceId);
}
