import { describe, it, expect, beforeEach } from 'vitest';
import { FraudDetectionService } from '../fraud-detection.service';
import { LedgerService } from '../ledger.service';

describe('FraudDetectionService', () => {
  let service: FraudDetectionService;

  beforeEach(() => {
    service = new FraudDetectionService({
      velocityWindowMs: 60000,
      maxTransactionsInWindow: 5,
      amountAnomalyMultiplier: 3,
      riskThresholds: { flag: 50, block: 80 },
    });
  });

  describe('checkTransaction', () => {
    it('should allow normal transactions', () => {
      const result = service.checkTransaction({
        transactionId: 'txn-1',
        userId: 'user-1',
        amount: 50,
        currency: 'USD',
      });

      expect(result.action).toBe('allow');
      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBe(0);
      expect(result.signals).toHaveLength(0);
    });

    it('should detect velocity (too many transactions)', () => {
      for (let i = 0; i < 5; i++) {
        service.recordTransaction({ userId: 'user-1', amount: 10 });
      }

      const result = service.checkTransaction({
        transactionId: 'txn-6',
        userId: 'user-1',
        amount: 10,
        currency: 'USD',
      });

      expect(result.signals.some((s) => s.type === 'velocity')).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(40);
    });

    it('should detect amount anomaly', () => {
      for (let i = 0; i < 5; i++) {
        service.recordTransaction({ userId: 'user-1', amount: 10 });
      }

      const result = service.checkTransaction({
        transactionId: 'txn-big',
        userId: 'user-1',
        amount: 500,
        currency: 'USD',
      });

      expect(result.signals.some((s) => s.type === 'amount_anomaly')).toBe(true);
    });

    it('should detect device anomaly', () => {
      service.recordTransaction({
        userId: 'user-1',
        amount: 10,
        deviceFingerprint: 'device-A',
      });

      const result = service.checkTransaction({
        transactionId: 'txn-device',
        userId: 'user-1',
        amount: 10,
        currency: 'USD',
        deviceFingerprint: 'device-B',
      });

      expect(result.signals.some((s) => s.type === 'device_anomaly')).toBe(true);
    });

    it('should detect geo anomaly', () => {
      service.recordTransaction({
        userId: 'user-1',
        amount: 10,
        country: 'US',
      });

      const result = service.checkTransaction({
        transactionId: 'txn-geo',
        userId: 'user-1',
        amount: 10,
        currency: 'USD',
        country: 'RU',
      });

      expect(result.signals.some((s) => s.type === 'geo_anomaly')).toBe(true);
    });

    it('should block high-risk transactions', () => {
      for (let i = 0; i < 5; i++) {
        service.recordTransaction({
          userId: 'user-1',
          amount: 10,
          deviceFingerprint: 'device-A',
          country: 'US',
        });
      }

      const result = service.checkTransaction({
        transactionId: 'txn-block',
        userId: 'user-1',
        amount: 500,
        currency: 'USD',
        deviceFingerprint: 'device-B',
        country: 'RU',
      });

      expect(result.action).toBe('block');
      expect(result.riskLevel).toBe('critical');
    });

    it('should flag medium-risk transactions', () => {
      service.recordTransaction({
        userId: 'user-1',
        amount: 10,
        deviceFingerprint: 'device-A',
      });

      const result = service.checkTransaction({
        transactionId: 'txn-flag',
        userId: 'user-1',
        amount: 10,
        currency: 'USD',
        deviceFingerprint: 'device-B',
        country: 'US',
      });

      expect(['flag', 'review', 'allow']).toContain(result.action);
      expect(result.signals.some((s) => s.type === 'device_anomaly')).toBe(true);
    });

    it('should validate input with zod', () => {
      expect(() =>
        service.checkTransaction({
          transactionId: '',
          userId: 'user-1',
          amount: 10,
          currency: 'USD',
        }),
      ).toThrow();
    });
  });

  describe('recordTransaction', () => {
    it('should record transaction history', () => {
      service.recordTransaction({ userId: 'user-1', amount: 100 });
      service.recordTransaction({ userId: 'user-1', amount: 200 });

      const profile = service.getUserRiskProfile('user-1');
      expect(profile.totalTransactions).toBe(2);
      expect(profile.averageAmount).toBe(150);
    });

    it('should track devices', () => {
      service.recordTransaction({ userId: 'user-1', amount: 10, deviceFingerprint: 'd1' });
      service.recordTransaction({ userId: 'user-1', amount: 10, deviceFingerprint: 'd2' });

      const profile = service.getUserRiskProfile('user-1');
      expect(profile.knownDevices).toBe(2);
    });

    it('should track countries', () => {
      service.recordTransaction({ userId: 'user-1', amount: 10, country: 'US' });
      service.recordTransaction({ userId: 'user-1', amount: 10, country: 'GB' });

      const profile = service.getUserRiskProfile('user-1');
      expect(profile.knownCountries).toBe(2);
    });

    it('should evict old entries when exceeding maxHistoryPerUser', () => {
      const smallService = new FraudDetectionService({
        velocityWindowMs: 60000,
        maxTransactionsInWindow: 5,
        amountAnomalyMultiplier: 3,
        riskThresholds: { flag: 50, block: 80 },
        maxHistoryPerUser: 5,
      });

      for (let i = 0; i < 10; i++) {
        smallService.recordTransaction({ userId: 'user-1', amount: 10 });
      }

      const profile = smallService.getUserRiskProfile('user-1');
      expect(profile.totalTransactions).toBe(5);
    });
  });

  describe('getUserRiskProfile', () => {
    it('should return empty profile for unknown user', () => {
      const profile = service.getUserRiskProfile('unknown');
      expect(profile.totalTransactions).toBe(0);
      expect(profile.averageAmount).toBe(0);
      expect(profile.knownDevices).toBe(0);
      expect(profile.knownCountries).toBe(0);
      expect(profile.recentTransactions).toBe(0);
    });

    it('should count recent transactions within velocity window', () => {
      service.recordTransaction({ userId: 'user-1', amount: 10 });
      service.recordTransaction({ userId: 'user-1', amount: 20 });

      const profile = service.getUserRiskProfile('user-1');
      expect(profile.recentTransactions).toBe(2);
    });
  });
});

describe('LedgerService', () => {
  let ledger: LedgerService;

  beforeEach(() => {
    ledger = new LedgerService();
  });

  describe('record', () => {
    it('should record a credit entry and update balance', () => {
      const entry = ledger.record({
        accountId: 'acc-1',
        type: 'credit',
        amount: 100,
        description: 'Initial deposit',
      });

      expect(entry.id).toMatch(/^led_/);
      expect(entry.accountId).toBe('acc-1');
      expect(entry.type).toBe('credit');
      expect(entry.amount).toBe(100);
      expect(entry.balanceAfter).toBe(100);
      expect(entry.description).toBe('Initial deposit');
      expect(entry.createdAt).toBeDefined();

      expect(ledger.getBalance('acc-1')).toBe(100);
    });

    it('should record a debit entry and reduce balance', () => {
      ledger.record({ accountId: 'acc-1', type: 'credit', amount: 500, description: 'Deposit' });
      const entry = ledger.record({
        accountId: 'acc-1',
        type: 'debit',
        amount: 200,
        description: 'Purchase',
      });

      expect(entry.balanceAfter).toBe(300);
      expect(ledger.getBalance('acc-1')).toBe(300);
    });

    it('should handle transfer as credit', () => {
      const entry = ledger.record({
        accountId: 'acc-1',
        type: 'transfer',
        amount: 50,
        description: 'Transfer in',
      });

      expect(entry.balanceAfter).toBe(50);
    });

    it('should handle revenue as credit', () => {
      const entry = ledger.record({
        accountId: 'acc-1',
        type: 'revenue',
        amount: 75,
        description: 'Ad revenue',
      });

      expect(entry.balanceAfter).toBe(75);
    });

    it('should handle fee as debit', () => {
      ledger.record({ accountId: 'acc-1', type: 'credit', amount: 100, description: 'Deposit' });
      const entry = ledger.record({
        accountId: 'acc-1',
        type: 'fee',
        amount: 5,
        description: 'Processing fee',
      });

      expect(entry.balanceAfter).toBe(95);
    });

    it('should handle payout as debit', () => {
      ledger.record({ accountId: 'acc-1', type: 'credit', amount: 1000, description: 'Earnings' });
      const entry = ledger.record({
        accountId: 'acc-1',
        type: 'payout',
        amount: 500,
        description: 'Cashout',
      });

      expect(entry.balanceAfter).toBe(500);
    });

    it('should store referenceId and metadata', () => {
      const entry = ledger.record({
        accountId: 'acc-1',
        type: 'credit',
        amount: 100,
        description: 'Test',
        referenceId: 'ref-123',
        metadata: { source: 'stripe' },
      });

      expect(entry.referenceId).toBe('ref-123');
      expect(entry.metadata).toEqual({ source: 'stripe' });
    });

    it('should validate input with zod', () => {
      expect(() =>
        ledger.record({
          accountId: '',
          type: 'credit',
          amount: 100,
          description: 'Test',
        }),
      ).toThrow();
    });

    it('should reject negative amounts', () => {
      expect(() =>
        ledger.record({
          accountId: 'acc-1',
          type: 'credit',
          amount: -10,
          description: 'Test',
        }),
      ).toThrow();
    });
  });

  describe('getEntries', () => {
    it('should return all entries without filters', () => {
      ledger.record({ accountId: 'acc-1', type: 'credit', amount: 100, description: 'A' });
      ledger.record({ accountId: 'acc-2', type: 'credit', amount: 200, description: 'B' });

      const entries = ledger.getEntries();
      expect(entries).toHaveLength(2);
    });

    it('should filter by accountId', () => {
      ledger.record({ accountId: 'acc-1', type: 'credit', amount: 100, description: 'A' });
      ledger.record({ accountId: 'acc-2', type: 'credit', amount: 200, description: 'B' });

      const entries = ledger.getEntries({ accountId: 'acc-1' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.accountId).toBe('acc-1');
    });

    it('should filter by type', () => {
      ledger.record({ accountId: 'acc-1', type: 'credit', amount: 100, description: 'A' });
      ledger.record({ accountId: 'acc-1', type: 'debit', amount: 50, description: 'B' });

      const entries = ledger.getEntries({ type: 'debit' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.type).toBe('debit');
    });

    it('should return a copy (not mutable reference)', () => {
      ledger.record({ accountId: 'acc-1', type: 'credit', amount: 100, description: 'A' });

      const entries1 = ledger.getEntries();
      const entries2 = ledger.getEntries();
      expect(entries1).not.toBe(entries2);
    });
  });

  describe('getBalance', () => {
    it('should return 0 for unknown account', () => {
      expect(ledger.getBalance('unknown')).toBe(0);
    });

    it('should compute correct balance across multiple entries', () => {
      ledger.record({ accountId: 'acc-1', type: 'credit', amount: 100, description: 'A' });
      ledger.record({ accountId: 'acc-1', type: 'credit', amount: 200, description: 'B' });
      ledger.record({ accountId: 'acc-1', type: 'debit', amount: 50, description: 'C' });

      expect(ledger.getBalance('acc-1')).toBe(250);
    });
  });

  describe('verify', () => {
    it('should return valid for consistent ledger', () => {
      ledger.record({ accountId: 'acc-1', type: 'credit', amount: 100, description: 'A' });
      ledger.record({ accountId: 'acc-1', type: 'debit', amount: 30, description: 'B' });
      ledger.record({ accountId: 'acc-2', type: 'credit', amount: 500, description: 'C' });

      const result = ledger.verify();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for empty ledger', () => {
      const result = ledger.verify();
      expect(result.valid).toBe(true);
    });
  });
});
