import { describe, it, expect, beforeEach } from 'vitest';
import { CoinWallet } from '../coins/wallet.js';

describe('CoinWallet', () => {
  let wallet: CoinWallet;

  beforeEach(() => {
    wallet = new CoinWallet();
  });

  describe('createWallet', () => {
    it('should create a new wallet with zero balance', () => {
      const w = wallet.createWallet('user-1');
      expect(w.userId).toBe('user-1');
      expect(w.balance).toBe(0);
      expect(w.createdAt).toBeInstanceOf(Date);
    });

    it('should return existing wallet if already created', () => {
      wallet.createWallet('user-1');
      const w2 = wallet.createWallet('user-1');
      expect(w2.balance).toBe(0);
    });
  });

  describe('getBalance', () => {
    it('should return balance for existing wallet', () => {
      wallet.createWallet('user-1');
      expect(wallet.getBalance('user-1')).toBe(0);
    });

    it('should throw for non-existent wallet', () => {
      expect(() => wallet.getBalance('unknown')).toThrow('Wallet not found');
    });
  });

  describe('creditCoins', () => {
    it('should credit coins to wallet', () => {
      wallet.createWallet('user-1');
      wallet.creditCoins('user-1', 100, 'test-credit');
      expect(wallet.getBalance('user-1')).toBe(100);
    });

    it('should throw for non-positive amount', () => {
      wallet.createWallet('user-1');
      expect(() => wallet.creditCoins('user-1', 0, 'bad')).toThrow('Amount must be positive');
      expect(() => wallet.creditCoins('user-1', -5, 'bad')).toThrow('Amount must be positive');
    });

    it('should accumulate multiple credits', () => {
      wallet.createWallet('user-1');
      wallet.creditCoins('user-1', 100, 'first');
      wallet.creditCoins('user-1', 50, 'second');
      expect(wallet.getBalance('user-1')).toBe(150);
    });

    it('should only credit once when the same idempotencyKey is used', () => {
      wallet.createWallet('user-1');
      const tx1 = wallet.creditCoins('user-1', 100, 'bonus', 'key-abc');
      const tx2 = wallet.creditCoins('user-1', 100, 'bonus', 'key-abc');
      expect(wallet.getBalance('user-1')).toBe(100);
      expect(tx1.id).toBe(tx2.id);
    });
  });

  describe('debitCoins', () => {
    it('should debit coins from wallet', () => {
      wallet.createWallet('user-1');
      wallet.creditCoins('user-1', 200, 'seed');
      wallet.debitCoins('user-1', 75, 'purchase');
      expect(wallet.getBalance('user-1')).toBe(125);
    });

    it('should throw insufficient balance error', () => {
      wallet.createWallet('user-1');
      wallet.creditCoins('user-1', 50, 'seed');
      expect(() => wallet.debitCoins('user-1', 100, 'purchase')).toThrow('Insufficient balance');
    });

    it('should throw for non-positive amount', () => {
      wallet.createWallet('user-1');
      expect(() => wallet.debitCoins('user-1', 0, 'bad')).toThrow('Amount must be positive');
    });
  });

  describe('getTransactionHistory', () => {
    it('should return all transactions for a user', () => {
      wallet.createWallet('user-1');
      wallet.creditCoins('user-1', 100, 'credit-1');
      wallet.debitCoins('user-1', 30, 'debit-1');
      const history = wallet.getTransactionHistory('user-1');
      expect(history).toHaveLength(2);
      expect(history[0]?.direction).toBe('credit');
      expect(history[1]?.direction).toBe('debit');
    });

    it('should isolate transactions between users', () => {
      wallet.createWallet('user-1');
      wallet.createWallet('user-2');
      wallet.creditCoins('user-1', 100, 'u1-credit');
      wallet.creditCoins('user-2', 200, 'u2-credit');
      expect(wallet.getTransactionHistory('user-1')).toHaveLength(1);
      expect(wallet.getTransactionHistory('user-2')).toHaveLength(1);
    });
  });
});
