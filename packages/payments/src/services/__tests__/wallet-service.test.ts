import { describe, it, expect, beforeEach } from 'vitest';
import { WalletService } from '../wallet-service';

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(() => {
    service = new WalletService();
  });

  describe('createWallet', () => {
    it('should create a wallet with default values', async () => {
      const wallet = await service.createWallet('user-1');
      expect(wallet.id).toMatch(/^wal_/);
      expect(wallet.userId).toBe('user-1');
      expect(wallet.balance).toBe(0);
      expect(wallet.currency).toBe('USD');
      expect(wallet.frozen).toBe(false);
      expect(wallet.dailyLimit).toBe(10000);
      expect(wallet.monthlyLimit).toBe(50000);
      expect(wallet.transactionLimit).toBe(5000);
      expect(wallet.totalCredits).toBe(0);
      expect(wallet.totalDebits).toBe(0);
    });

    it('should create wallet with custom currency', async () => {
      const wallet = await service.createWallet('user-1', 'EUR');
      expect(wallet.currency).toBe('EUR');
    });

    it('should throw when wallet already exists', async () => {
      await service.createWallet('user-1');
      await expect(service.createWallet('user-1')).rejects.toThrow('Wallet already exists');
    });
  });

  describe('getBalance', () => {
    it('should return balance info', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 100, 'test');

      const balance = await service.getBalance('user-1');
      expect(balance.balance).toBe(100);
      expect(balance.currency).toBe('USD');
      expect(balance.frozen).toBe(false);
      expect(balance.available).toBe(100);
    });

    it('should return 0 available when frozen', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 100, 'test');
      await service.freeze('user-1', 'suspicious');

      const balance = await service.getBalance('user-1');
      expect(balance.frozen).toBe(true);
      expect(balance.available).toBe(0);
    });

    it('should throw for non-existent wallet', async () => {
      await expect(service.getBalance('unknown')).rejects.toThrow('Wallet not found');
    });
  });

  describe('credit', () => {
    it('should credit funds and create transaction', async () => {
      await service.createWallet('user-1');
      const txn = await service.credit('user-1', 500, 'Payment received', 'ref-1');

      expect(txn.type).toBe('credit');
      expect(txn.amount).toBe(500);
      expect(txn.balanceBefore).toBe(0);
      expect(txn.balanceAfter).toBe(500);
      expect(txn.description).toBe('Payment received');
      expect(txn.referenceId).toBe('ref-1');

      const balance = await service.getBalance('user-1');
      expect(balance.balance).toBe(500);
    });

    it('should throw for non-positive amount', async () => {
      await service.createWallet('user-1');
      await expect(service.credit('user-1', 0, 'test')).rejects.toThrow(
        'Credit amount must be positive',
      );
      await expect(service.credit('user-1', -10, 'test')).rejects.toThrow(
        'Credit amount must be positive',
      );
    });
  });

  describe('debit', () => {
    it('should debit funds and create transaction', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 1000, 'Initial');
      const txn = await service.debit('user-1', 300, 'Purchase', 'order-1');

      expect(txn.type).toBe('debit');
      expect(txn.amount).toBe(300);
      expect(txn.balanceBefore).toBe(1000);
      expect(txn.balanceAfter).toBe(700);
    });

    it('should throw for insufficient balance', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 100, 'Initial');
      await expect(service.debit('user-1', 200, 'Purchase')).rejects.toThrow(
        'Insufficient balance',
      );
    });

    it('should throw for non-positive amount', async () => {
      await service.createWallet('user-1');
      await expect(service.debit('user-1', 0, 'test')).rejects.toThrow(
        'Debit amount must be positive',
      );
    });

    it('should throw when wallet is frozen', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 1000, 'Initial');
      await service.freeze('user-1', 'fraud');
      await expect(service.debit('user-1', 100, 'Purchase')).rejects.toThrow('Wallet is frozen');
    });

    it('should throw when exceeding transaction limit', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 10000, 'Initial');
      await expect(service.debit('user-1', 6000, 'Large purchase')).rejects.toThrow(
        'exceeds transaction limit',
      );
    });
  });

  describe('transfer', () => {
    it('should transfer funds between wallets', async () => {
      await service.createWallet('user-1');
      await service.createWallet('user-2');
      await service.credit('user-1', 1000, 'Initial');

      const { fromTxn, toTxn } = await service.transfer('user-1', 'user-2', 300, 'Payment');

      expect(fromTxn.type).toBe('transfer_out');
      expect(fromTxn.amount).toBe(300);
      expect(fromTxn.balanceAfter).toBe(700);
      expect(fromTxn.counterpartyWalletId).toBeDefined();

      expect(toTxn.type).toBe('transfer_in');
      expect(toTxn.amount).toBe(300);
      expect(toTxn.balanceAfter).toBe(300);

      const bal1 = await service.getBalance('user-1');
      const bal2 = await service.getBalance('user-2');
      expect(bal1.balance).toBe(700);
      expect(bal2.balance).toBe(300);
    });

    it('should throw for same wallet transfer', async () => {
      await service.createWallet('user-1');
      await expect(service.transfer('user-1', 'user-1', 100)).rejects.toThrow(
        'Cannot transfer to same wallet',
      );
    });

    it('should throw for below minimum amount', async () => {
      await service.createWallet('user-1');
      await service.createWallet('user-2');
      await expect(service.transfer('user-1', 'user-2', 0.5)).rejects.toThrow(
        'Minimum transfer amount',
      );
    });

    it('should throw for insufficient balance', async () => {
      await service.createWallet('user-1');
      await service.createWallet('user-2');
      await service.credit('user-1', 50, 'Initial');
      await expect(service.transfer('user-1', 'user-2', 100)).rejects.toThrow(
        'Insufficient balance',
      );
    });
  });

  describe('getTransactionHistory', () => {
    it('should return transaction history', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 500, 'Credit 1');
      await service.credit('user-1', 300, 'Credit 2');
      await service.debit('user-1', 100, 'Debit 1');

      const { transactions, total } = await service.getTransactionHistory('user-1');
      expect(total).toBe(3);
      expect(transactions).toHaveLength(3);
    });

    it('should filter by type', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 500, 'Credit');
      await service.debit('user-1', 100, 'Debit');

      const { transactions } = await service.getTransactionHistory('user-1', { type: 'credit' });
      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.type).toBe('credit');
    });

    it('should support pagination', async () => {
      await service.createWallet('user-1');
      for (let i = 0; i < 5; i++) {
        await service.credit('user-1', 100, `Credit ${i}`);
      }

      const page1 = await service.getTransactionHistory('user-1', { limit: 2, offset: 0 });
      expect(page1.transactions).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = await service.getTransactionHistory('user-1', { limit: 2, offset: 2 });
      expect(page2.transactions).toHaveLength(2);
    });
  });

  describe('freeze and unfreeze', () => {
    it('should freeze a wallet', async () => {
      await service.createWallet('user-1');
      const wallet = await service.freeze('user-1', 'suspicious activity');
      expect(wallet.frozen).toBe(true);
      expect(wallet.frozenReason).toBe('suspicious activity');
      expect(wallet.frozenAt).toBeDefined();
    });

    it('should throw when freezing already frozen wallet', async () => {
      await service.createWallet('user-1');
      await service.freeze('user-1', 'reason');
      await expect(service.freeze('user-1', 'another reason')).rejects.toThrow('already frozen');
    });

    it('should unfreeze a wallet', async () => {
      await service.createWallet('user-1');
      await service.freeze('user-1', 'reason');
      const wallet = await service.unfreeze('user-1');
      expect(wallet.frozen).toBe(false);
      expect(wallet.frozenReason).toBeUndefined();
      expect(wallet.frozenAt).toBeUndefined();
    });

    it('should throw when unfreezing non-frozen wallet', async () => {
      await service.createWallet('user-1');
      await expect(service.unfreeze('user-1')).rejects.toThrow('not frozen');
    });
  });

  describe('setLimits', () => {
    it('should update wallet limits', async () => {
      await service.createWallet('user-1');
      const wallet = await service.setLimits('user-1', {
        daily: 20000,
        monthly: 100000,
        transaction: 10000,
      });
      expect(wallet.dailyLimit).toBe(20000);
      expect(wallet.monthlyLimit).toBe(100000);
      expect(wallet.transactionLimit).toBe(10000);
    });

    it('should update only specified limits', async () => {
      await service.createWallet('user-1');
      const wallet = await service.setLimits('user-1', { daily: 20000 });
      expect(wallet.dailyLimit).toBe(20000);
      expect(wallet.monthlyLimit).toBe(50000);
      expect(wallet.transactionLimit).toBe(5000);
    });
  });

  describe('checkLimit', () => {
    it('should allow valid transaction', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 1000, 'Initial');

      const result = await service.checkLimit('user-1', 500);
      expect(result.allowed).toBe(true);
      expect(result.dailyRemaining).toBeGreaterThan(0);
      expect(result.monthlyRemaining).toBeGreaterThan(0);
    });

    it('should reject when frozen', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 1000, 'Initial');
      await service.freeze('user-1', 'reason');

      const result = await service.checkLimit('user-1', 100);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('frozen');
    });

    it('should reject insufficient balance', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 100, 'Initial');

      const result = await service.checkLimit('user-1', 200);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient');
    });

    it('should reject exceeding transaction limit', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 10000, 'Initial');

      const result = await service.checkLimit('user-1', 6000);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('transaction limit');
    });
  });

  describe('getStatement', () => {
    it('should return monthly statement', async () => {
      await service.createWallet('user-1');
      await service.credit('user-1', 1000, 'Credit');
      await service.debit('user-1', 200, 'Debit');

      const now = new Date();
      const statement = await service.getStatement('user-1', now.getMonth() + 1, now.getFullYear());

      expect(statement.totalCredits).toBe(1000);
      expect(statement.totalDebits).toBe(200);
      expect(statement.transactionCount).toBe(2);
      expect(statement.transactions).toHaveLength(2);
    });

    it('should return empty statement for month with no transactions', async () => {
      await service.createWallet('user-1');
      const statement = await service.getStatement('user-1', 1, 2020);
      expect(statement.transactionCount).toBe(0);
      expect(statement.totalCredits).toBe(0);
      expect(statement.totalDebits).toBe(0);
    });
  });
});
