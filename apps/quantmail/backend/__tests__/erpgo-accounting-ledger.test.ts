// @vitest-environment node
// ============================================================================
// ERPGo Double-Entry Accounting Ledger & Chart of Accounts Test Suite
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAccount,
  recordJournalEntry,
  generateTrialBalance,
  getJournalEntries,
  clearLedgerForTesting,
  getAccount,
  AccountingLedgerService,
} from '../services/accounting-ledger.service';

describe('ERPGo Double-Entry Accounting Ledger & Chart of Accounts', () => {
  const WORKSPACE_ID = 'ws-erpgo-test-101';

  beforeEach(() => {
    clearLedgerForTesting();
  });

  describe('Chart of Accounts Management', () => {
    it('creates accounts across Asset, Revenue, Expense, Liability, and Equity types', () => {
      const cashAccount = createAccount(WORKSPACE_ID, {
        code: '1010',
        name: 'Operating Cash & Bank',
        type: 'ASSET',
        currency: 'USD',
      });

      const revenueAccount = createAccount(WORKSPACE_ID, {
        code: '4010',
        name: 'SaaS Subscription Revenue',
        type: 'REVENUE',
        currency: 'USD',
      });

      const expenseAccount = createAccount(WORKSPACE_ID, {
        code: '5010',
        name: 'Cloud Hosting & Infrastructure Expense',
        type: 'EXPENSE',
        currency: 'USD',
      });

      const liabilityAccount = createAccount(WORKSPACE_ID, {
        code: '2010',
        name: 'Accounts Payable',
        type: 'LIABILITY',
        currency: 'USD',
      });

      const equityAccount = createAccount(WORKSPACE_ID, {
        code: '3010',
        name: "Founder's Contributed Capital",
        type: 'EQUITY',
        currency: 'USD',
      });

      expect(cashAccount.id).toMatch(/^acc_/);
      expect(cashAccount.workspaceId).toBe(WORKSPACE_ID);
      expect(cashAccount.code).toBe('1010');
      expect(cashAccount.name).toBe('Operating Cash & Bank');
      expect(cashAccount.type).toBe('ASSET');
      expect(cashAccount.balance).toBe(0);

      expect(revenueAccount.code).toBe('4010');
      expect(revenueAccount.type).toBe('REVENUE');
      expect(revenueAccount.balance).toBe(0);

      expect(expenseAccount.code).toBe('5010');
      expect(expenseAccount.type).toBe('EXPENSE');
      expect(expenseAccount.balance).toBe(0);

      expect(liabilityAccount.code).toBe('2010');
      expect(liabilityAccount.type).toBe('LIABILITY');
      expect(liabilityAccount.balance).toBe(0);

      expect(equityAccount.code).toBe('3010');
      expect(equityAccount.type).toBe('EQUITY');
      expect(equityAccount.balance).toBe(0);
    });

    it('rejects account creation with missing code or name', () => {
      expect(() => {
        createAccount(WORKSPACE_ID, {
          code: '',
          name: 'Invalid Account',
          type: 'ASSET',
          currency: 'USD',
        });
      }).toThrow('ACCOUNT_CODE_REQUIRED');

      expect(() => {
        createAccount(WORKSPACE_ID, {
          code: '1020',
          name: '   ',
          type: 'ASSET',
          currency: 'USD',
        });
      }).toThrow('ACCOUNT_NAME_REQUIRED');
    });
  });

  describe('Double-Entry Journal Entry Recording & Balance Rules', () => {
    it('records a balanced journal entry and updates account balances correctly', () => {
      // 1. Create Chart of Accounts
      const cash = createAccount(WORKSPACE_ID, {
        code: '1010',
        name: 'Operating Cash',
        type: 'ASSET',
        currency: 'USD',
      });

      const revenue = createAccount(WORKSPACE_ID, {
        code: '4010',
        name: 'Subscription Revenue',
        type: 'REVENUE',
        currency: 'USD',
      });

      // 2. Customer pays $5,000 for annual enterprise subscription
      // Debit: Cash (Asset increases) $5,000
      // Credit: Subscription Revenue (Revenue increases) $5,000
      const entry = recordJournalEntry(WORKSPACE_ID, {
        reference: 'JE-2026-0001',
        entryDate: '2026-09-27',
        description: 'Customer payment for Enterprise Annual License',
        items: [
          { accountId: cash.id, debit: 5000, credit: 0, description: 'Bank deposit' },
          { accountId: revenue.id, debit: 0, credit: 5000, description: 'Enterprise sale' },
        ],
      });

      expect(entry.id).toMatch(/^je_/);
      expect(entry.reference).toBe('JE-2026-0001');
      expect(entry.totalAmount).toBe(5000);
      expect(entry.items).toHaveLength(2);

      // Verify normal balance updates:
      // Asset balance increases with Debit
      const updatedCash = getAccount(cash.id);
      expect(updatedCash?.balance).toBe(5000);

      // Revenue balance increases with Credit
      const updatedRevenue = getAccount(revenue.id);
      expect(updatedRevenue?.balance).toBe(5000);
    });

    it('updates expense and asset balances accurately when recording operational expenses', () => {
      const cash = createAccount(WORKSPACE_ID, {
        code: '1010',
        name: 'Checking Account',
        type: 'ASSET',
        currency: 'USD',
      });

      const serverExpense = createAccount(WORKSPACE_ID, {
        code: '5020',
        name: 'AWS Cloud Compute Expense',
        type: 'EXPENSE',
        currency: 'USD',
      });

      // Pre-fund cash with $10,000
      const capital = createAccount(WORKSPACE_ID, {
        code: '3010',
        name: 'Capital',
        type: 'EQUITY',
        currency: 'USD',
      });

      recordJournalEntry(WORKSPACE_ID, {
        reference: 'JE-INIT',
        description: 'Initial funding',
        items: [
          { accountId: cash.id, debit: 10000, credit: 0 },
          { accountId: capital.id, debit: 0, credit: 10000 },
        ],
      });

      // Pay AWS bill: $1,250
      // Debit: AWS Cloud Compute Expense (Expense increases) $1,250
      // Credit: Checking Account (Asset decreases) $1,250
      recordJournalEntry(WORKSPACE_ID, {
        reference: 'JE-AWS-01',
        description: 'AWS September Hosting Invoice',
        items: [
          { accountId: serverExpense.id, debit: 1250.5, credit: 0 },
          { accountId: cash.id, debit: 0, credit: 1250.5 },
        ],
      });

      const cashAfterAWS = getAccount(cash.id);
      const expenseAfterAWS = getAccount(serverExpense.id);

      expect(cashAfterAWS?.balance).toBe(8749.5); // 10000 - 1250.50
      expect(expenseAfterAWS?.balance).toBe(1250.5); // Expense increases with debit
    });

    it('unbalanced journal entry throws UNBALANCED_JOURNAL_ENTRY error', () => {
      const cash = createAccount(WORKSPACE_ID, {
        code: '1010',
        name: 'Cash',
        type: 'ASSET',
        currency: 'USD',
      });

      const revenue = createAccount(WORKSPACE_ID, {
        code: '4010',
        name: 'Revenue',
        type: 'REVENUE',
        currency: 'USD',
      });

      // Debits (100) != Credits (90)
      expect(() => {
        recordJournalEntry(WORKSPACE_ID, {
          reference: 'JE-ERR-01',
          description: 'Unbalanced entry test',
          items: [
            { accountId: cash.id, debit: 100, credit: 0 },
            { accountId: revenue.id, debit: 0, credit: 90 },
          ],
        });
      }).toThrow('UNBALANCED_JOURNAL_ENTRY');

      // Empty items
      expect(() => {
        recordJournalEntry(WORKSPACE_ID, {
          reference: 'JE-ERR-EMPTY',
          description: 'Empty items entry test',
          items: [],
        });
      }).toThrow('UNBALANCED_JOURNAL_ENTRY');

      // Accounts balances must not have been modified
      expect(getAccount(cash.id)?.balance).toBe(0);
      expect(getAccount(revenue.id)?.balance).toBe(0);
    });

    it('rejects journal entries referencing non-existent accounts', () => {
      const cash = createAccount(WORKSPACE_ID, {
        code: '1010',
        name: 'Cash',
        type: 'ASSET',
        currency: 'USD',
      });

      expect(() => {
        recordJournalEntry(WORKSPACE_ID, {
          reference: 'JE-INVALID-ACC',
          description: 'Missing account test',
          items: [
            { accountId: cash.id, debit: 500, credit: 0 },
            { accountId: 'acc_does_not_exist', debit: 0, credit: 500 },
          ],
        });
      }).toThrow('ACCOUNT_NOT_FOUND');
    });

    it('rejects journal entries with negative amounts', () => {
      const cash = createAccount(WORKSPACE_ID, {
        code: '1010',
        name: 'Cash',
        type: 'ASSET',
        currency: 'USD',
      });

      const revenue = createAccount(WORKSPACE_ID, {
        code: '4010',
        name: 'Revenue',
        type: 'REVENUE',
        currency: 'USD',
      });

      expect(() => {
        recordJournalEntry(WORKSPACE_ID, {
          reference: 'JE-NEG',
          description: 'Negative debit',
          items: [
            { accountId: cash.id, debit: -50, credit: 0 },
            { accountId: revenue.id, debit: 0, credit: -50 },
          ],
        });
      }).toThrow('NEGATIVE_AMOUNT');
    });
  });

  describe('Trial Balance Report Generation', () => {
    it('computes totalDebits === totalCredits and isBalanced: true across complex transactions', () => {
      // Setup Chart of Accounts:
      // ASSETS
      const cash = createAccount(WORKSPACE_ID, {
        code: '1010',
        name: 'Cash & Cash Equivalents',
        type: 'ASSET',
        currency: 'USD',
      });
      const ar = createAccount(WORKSPACE_ID, {
        code: '1200',
        name: 'Accounts Receivable',
        type: 'ASSET',
        currency: 'USD',
      });

      // LIABILITIES
      const ap = createAccount(WORKSPACE_ID, {
        code: '2010',
        name: 'Accounts Payable',
        type: 'LIABILITY',
        currency: 'USD',
      });

      // EQUITY
      const commonStock = createAccount(WORKSPACE_ID, {
        code: '3010',
        name: 'Common Stock Equity',
        type: 'EQUITY',
        currency: 'USD',
      });

      // REVENUE
      const consultingRevenue = createAccount(WORKSPACE_ID, {
        code: '4010',
        name: 'Cloud Consulting Revenue',
        type: 'REVENUE',
        currency: 'USD',
      });

      // EXPENSES
      const salaryExpense = createAccount(WORKSPACE_ID, {
        code: '5010',
        name: 'Engineering Salaries',
        type: 'EXPENSE',
        currency: 'USD',
      });
      const officeSupplies = createAccount(WORKSPACE_ID, {
        code: '5030',
        name: 'Office Supplies Expense',
        type: 'EXPENSE',
        currency: 'USD',
      });

      // 1. Initial Investment: $25,000 cash for common stock
      recordJournalEntry(WORKSPACE_ID, {
        reference: 'JE-INV-01',
        description: 'Initial seed capital',
        items: [
          { accountId: cash.id, debit: 25000, credit: 0 },
          { accountId: commonStock.id, debit: 0, credit: 25000 },
        ],
      });

      // 2. Billed client $8,000 on account for consulting services
      recordJournalEntry(WORKSPACE_ID, {
        reference: 'JE-REV-01',
        description: 'Invoice #1001 for Consulting Services',
        items: [
          { accountId: ar.id, debit: 8000, credit: 0 },
          { accountId: consultingRevenue.id, debit: 0, credit: 8000 },
        ],
      });

      // 3. Client pays $5,000 of Accounts Receivable
      recordJournalEntry(WORKSPACE_ID, {
        reference: 'JE-PAY-01',
        description: 'Client payment against AR',
        items: [
          { accountId: cash.id, debit: 5000, credit: 0 },
          { accountId: ar.id, debit: 0, credit: 5000 },
        ],
      });

      // 4. Purchased office supplies on credit for $750
      recordJournalEntry(WORKSPACE_ID, {
        reference: 'JE-SUPP-01',
        description: 'Supplies from vendor on net-30 terms',
        items: [
          { accountId: officeSupplies.id, debit: 750, credit: 0 },
          { accountId: ap.id, debit: 0, credit: 750 },
        ],
      });

      // 5. Paid engineer salaries $6,200 from cash
      recordJournalEntry(WORKSPACE_ID, {
        reference: 'JE-PAYROLL-01',
        description: 'Bi-weekly payroll distribution',
        items: [
          { accountId: salaryExpense.id, debit: 6200, credit: 0 },
          { accountId: cash.id, debit: 0, credit: 6200 },
        ],
      });

      // Generate Trial Balance Report
      const trialBalance = generateTrialBalance(WORKSPACE_ID);

      expect(trialBalance.workspaceId).toBe(WORKSPACE_ID);
      expect(trialBalance.asOfDate).toBeDefined();
      expect(trialBalance.accounts).toHaveLength(7);

      // Verify each account balance:
      // Cash: 25000 + 5000 - 6200 = 23800 (Debit)
      const cashRow = trialBalance.accounts.find((a) => a.code === '1010');
      expect(cashRow?.debit).toBe(23800);
      expect(cashRow?.credit).toBe(0);

      // AR: 8000 - 5000 = 3000 (Debit)
      const arRow = trialBalance.accounts.find((a) => a.code === '1200');
      expect(arRow?.debit).toBe(3000);
      expect(arRow?.credit).toBe(0);

      // AP: 750 (Credit)
      const apRow = trialBalance.accounts.find((a) => a.code === '2010');
      expect(apRow?.debit).toBe(0);
      expect(apRow?.credit).toBe(750);

      // Common Stock: 25000 (Credit)
      const stockRow = trialBalance.accounts.find((a) => a.code === '3010');
      expect(stockRow?.debit).toBe(0);
      expect(stockRow?.credit).toBe(25000);

      // Revenue: 8000 (Credit)
      const revRow = trialBalance.accounts.find((a) => a.code === '4010');
      expect(revRow?.debit).toBe(0);
      expect(revRow?.credit).toBe(8000);

      // Salary Expense: 6200 (Debit)
      const salaryRow = trialBalance.accounts.find((a) => a.code === '5010');
      expect(salaryRow?.debit).toBe(6200);
      expect(salaryRow?.credit).toBe(0);

      // Office Supplies: 750 (Debit)
      const suppliesRow = trialBalance.accounts.find((a) => a.code === '5030');
      expect(suppliesRow?.debit).toBe(750);
      expect(suppliesRow?.credit).toBe(0);

      // Mathematical Equality:
      // Total Debits = 23800 + 3000 + 6200 + 750 = 33750
      // Total Credits = 750 + 25000 + 8000 = 33750
      expect(trialBalance.totalDebits).toBe(33750);
      expect(trialBalance.totalCredits).toBe(33750);
      expect(trialBalance.totalDebits).toBe(trialBalance.totalCredits);
      expect(trialBalance.isBalanced).toBe(true);

      // Verify getJournalEntries returns all 5 recorded entries
      const entries = getJournalEntries(WORKSPACE_ID);
      expect(entries).toHaveLength(5);
    });

    it('isolates ledgers and trial balance by workspaceId', () => {
      const wsA = 'ws-company-alpha';
      const wsB = 'ws-company-beta';

      const cashA = createAccount(wsA, {
        code: '1010',
        name: 'Cash A',
        type: 'ASSET',
        currency: 'USD',
      });
      const revA = createAccount(wsA, {
        code: '4010',
        name: 'Rev A',
        type: 'REVENUE',
        currency: 'USD',
      });

      const cashB = createAccount(wsB, {
        code: '1010',
        name: 'Cash B',
        type: 'ASSET',
        currency: 'EUR',
      });
      const revB = createAccount(wsB, {
        code: '4010',
        name: 'Rev B',
        type: 'REVENUE',
        currency: 'EUR',
      });

      recordJournalEntry(wsA, {
        reference: 'JE-A1',
        description: 'Alpha Sale',
        items: [
          { accountId: cashA.id, debit: 1000, credit: 0 },
          { accountId: revA.id, debit: 0, credit: 1000 },
        ],
      });

      recordJournalEntry(wsB, {
        reference: 'JE-B1',
        description: 'Beta Sale',
        items: [
          { accountId: cashB.id, debit: 2000, credit: 0 },
          { accountId: revB.id, debit: 0, credit: 2000 },
        ],
      });

      const tbA = generateTrialBalance(wsA);
      const tbB = generateTrialBalance(wsB);

      expect(tbA.totalDebits).toBe(1000);
      expect(tbA.totalCredits).toBe(1000);
      expect(tbA.accounts).toHaveLength(2);

      expect(tbB.totalDebits).toBe(2000);
      expect(tbB.totalCredits).toBe(2000);
      expect(tbB.accounts).toHaveLength(2);

      expect(getJournalEntries(wsA)).toHaveLength(1);
      expect(getJournalEntries(wsB)).toHaveLength(1);
    });

    it('can be instantiated as standalone AccountingLedgerService class', () => {
      const isolatedService = new AccountingLedgerService();
      const ws = 'ws-isolated-custom';

      const bank = isolatedService.createAccount(ws, {
        code: '1000',
        name: 'Vault Cash',
        type: 'ASSET',
        currency: 'GBP',
      });
      const equity = isolatedService.createAccount(ws, {
        code: '3000',
        name: 'Equity',
        type: 'EQUITY',
        currency: 'GBP',
      });

      isolatedService.recordJournalEntry(ws, {
        reference: 'JE-ISO-1',
        description: 'Funding',
        items: [
          { accountId: bank.id, debit: 777, credit: 0 },
          { accountId: equity.id, debit: 0, credit: 777 },
        ],
      });

      const tb = isolatedService.generateTrialBalance(ws);
      expect(tb.isBalanced).toBe(true);
      expect(tb.totalDebits).toBe(777);
      expect(tb.totalCredits).toBe(777);
    });
  });
});
