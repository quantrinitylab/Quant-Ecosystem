// ============================================================================
// Payments - Fraud Detection Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { FraudDetectionService } from '../fraud-detection.service';

describe('FraudDetectionService', () => {
  let service: FraudDetectionService;

  beforeEach(() => {
    service = new FraudDetectionService({
      velocityWindowMs: 60_000, // 1 minute
      maxTransactionsInWindow: 5,
      amountAnomalyMultiplier: 3,
      riskThresholds: { flag: 50, block: 75 },
    });
  });

  describe('checkTransaction', () => {
    it('should allow a normal transaction with low risk', () => {
      const result = service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 50,
        currency: 'USD',
      });

      expect(result.transactionId).toBe('txn_1');
      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBe(0);
      expect(result.action).toBe('allow');
      expect(result.signals).toHaveLength(0);
      expect(result.checkedAt).toBeGreaterThan(0);
    });

    it('should detect velocity anomaly when too many transactions in window', () => {
      // Record enough transactions to trigger velocity check
      for (let i = 0; i < 5; i++) {
        service.recordTransaction({ userId: 'user_1', amount: 10 });
      }

      const result = service.checkTransaction({
        transactionId: 'txn_6',
        userId: 'user_1',
        amount: 10,
        currency: 'USD',
      });

      expect(result.riskScore).toBeGreaterThan(0);
      const velocitySignal = result.signals.find((s) => s.type === 'velocity');
      expect(velocitySignal).toBeDefined();
      expect(velocitySignal!.score).toBe(40);
    });

    it('should detect amount anomaly for unusually large transactions', () => {
      // Build history with small amounts
      for (let i = 0; i < 5; i++) {
        service.recordTransaction({ userId: 'user_1', amount: 10 });
      }

      // Large transaction should trigger anomaly
      const result = service.checkTransaction({
        transactionId: 'txn_big',
        userId: 'user_1',
        amount: 100, // 10x average, exceeds 3x multiplier
        currency: 'USD',
      });

      const amountSignal = result.signals.find((s) => s.type === 'amount_anomaly');
      expect(amountSignal).toBeDefined();
      expect(amountSignal!.score).toBe(35);
    });

    it('should not trigger amount anomaly with insufficient history', () => {
      service.recordTransaction({ userId: 'user_1', amount: 10 });
      service.recordTransaction({ userId: 'user_1', amount: 10 });

      const result = service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 100,
        currency: 'USD',
      });

      const amountSignal = result.signals.find((s) => s.type === 'amount_anomaly');
      expect(amountSignal).toBeUndefined();
    });

    it('should detect device fingerprint anomaly', () => {
      // Record with known device
      service.recordTransaction({ userId: 'user_1', amount: 10, deviceFingerprint: 'device_A' });

      // Check from new device
      const result = service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 10,
        currency: 'USD',
        deviceFingerprint: 'device_B',
      });

      const deviceSignal = result.signals.find((s) => s.type === 'device_anomaly');
      expect(deviceSignal).toBeDefined();
      expect(deviceSignal!.score).toBe(25);
    });

    it('should not trigger device anomaly for known device', () => {
      service.recordTransaction({ userId: 'user_1', amount: 10, deviceFingerprint: 'device_A' });

      const result = service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 10,
        currency: 'USD',
        deviceFingerprint: 'device_A',
      });

      const deviceSignal = result.signals.find((s) => s.type === 'device_anomaly');
      expect(deviceSignal).toBeUndefined();
    });

    it('should detect geographic anomaly', () => {
      // Record from known country
      service.recordTransaction({ userId: 'user_1', amount: 10, country: 'US' });

      // Check from new country
      const result = service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 10,
        currency: 'USD',
        country: 'RU',
      });

      const geoSignal = result.signals.find((s) => s.type === 'geo_anomaly');
      expect(geoSignal).toBeDefined();
      expect(geoSignal!.score).toBe(30);
    });

    it('should not trigger geo anomaly for known country', () => {
      service.recordTransaction({ userId: 'user_1', amount: 10, country: 'US' });

      const result = service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 10,
        currency: 'USD',
        country: 'US',
      });

      const geoSignal = result.signals.find((s) => s.type === 'geo_anomaly');
      expect(geoSignal).toBeUndefined();
    });

    it('should combine multiple signals for higher risk score', () => {
      // Set up history
      for (let i = 0; i < 5; i++) {
        service.recordTransaction({
          userId: 'user_1',
          amount: 10,
          deviceFingerprint: 'device_A',
          country: 'US',
        });
      }

      // Trigger velocity + amount + device + geo
      const result = service.checkTransaction({
        transactionId: 'txn_bad',
        userId: 'user_1',
        amount: 500, // amount anomaly
        currency: 'USD',
        deviceFingerprint: 'device_X', // new device
        country: 'NG', // new country
      });

      expect(result.signals.length).toBeGreaterThanOrEqual(3);
      expect(result.riskScore).toBeGreaterThanOrEqual(75);
      expect(result.action).toBe('block');
    });

    it('should flag transactions above flag threshold', () => {
      // Trigger velocity + geo (40 + 30 = 70 >= 50)
      for (let i = 0; i < 5; i++) {
        service.recordTransaction({ userId: 'user_1', amount: 10, country: 'US' });
      }

      const result = service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 10,
        currency: 'USD',
        country: 'RU',
      });

      expect(result.riskScore).toBeGreaterThanOrEqual(50);
      expect(result.action).toBe('flag');
    });

    it('should cap risk score at 100', () => {
      // Set up to trigger all signals with max scores
      for (let i = 0; i < 5; i++) {
        service.recordTransaction({
          userId: 'user_1',
          amount: 1,
          deviceFingerprint: 'device_A',
          country: 'US',
        });
      }

      const result = service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 1000,
        currency: 'USD',
        deviceFingerprint: 'device_X',
        country: 'NG',
      });

      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should reject invalid input', () => {
      expect(() =>
        service.checkTransaction({
          transactionId: '',
          userId: 'user_1',
          amount: 50,
          currency: 'USD',
        }),
      ).toThrow();

      expect(() =>
        service.checkTransaction({
          transactionId: 'txn_1',
          userId: 'user_1',
          amount: -10,
          currency: 'USD',
        }),
      ).toThrow();
    });
  });

  describe('recordTransaction', () => {
    it('should record transaction for future analysis', () => {
      service.recordTransaction({ userId: 'user_1', amount: 50 });

      const profile = service.getUserRiskProfile('user_1');
      expect(profile.totalTransactions).toBe(1);
      expect(profile.averageAmount).toBe(50);
    });

    it('should track device fingerprints', () => {
      service.recordTransaction({ userId: 'user_1', amount: 10, deviceFingerprint: 'fp_1' });
      service.recordTransaction({ userId: 'user_1', amount: 10, deviceFingerprint: 'fp_2' });

      const profile = service.getUserRiskProfile('user_1');
      expect(profile.knownDevices).toBe(2);
    });

    it('should track countries', () => {
      service.recordTransaction({ userId: 'user_1', amount: 10, country: 'US' });
      service.recordTransaction({ userId: 'user_1', amount: 10, country: 'UK' });

      const profile = service.getUserRiskProfile('user_1');
      expect(profile.knownCountries).toBe(2);
    });
  });

  describe('auto-record on checkTransaction', () => {
    it('should automatically record the transaction after checking', () => {
      service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 50,
        currency: 'USD',
        deviceFingerprint: 'fp_auto',
        country: 'US',
      });

      const profile = service.getUserRiskProfile('user_1');
      expect(profile.totalTransactions).toBe(1);
      expect(profile.averageAmount).toBe(50);
      expect(profile.knownDevices).toBe(1);
      expect(profile.knownCountries).toBe(1);
    });
  });

  describe('history eviction', () => {
    it('should evict oldest entries when maxHistoryPerUser is exceeded', () => {
      const smallService = new FraudDetectionService({
        velocityWindowMs: 60_000,
        maxTransactionsInWindow: 5,
        amountAnomalyMultiplier: 3,
        riskThresholds: { flag: 50, block: 75 },
        maxHistoryPerUser: 5,
      });

      // Record 7 transactions (exceeds limit of 5)
      for (let i = 0; i < 7; i++) {
        smallService.recordTransaction({ userId: 'user_1', amount: 10 + i });
      }

      const profile = smallService.getUserRiskProfile('user_1');
      // Only the last 5 should remain
      expect(profile.totalTransactions).toBe(5);
      // Average of last 5: (12+13+14+15+16)/5 = 14
      expect(profile.averageAmount).toBe(14);
    });
  });

  describe('getUserRiskProfile', () => {
    it('should return empty profile for unknown user', () => {
      const profile = service.getUserRiskProfile('unknown');
      expect(profile.totalTransactions).toBe(0);
      expect(profile.averageAmount).toBe(0);
      expect(profile.knownDevices).toBe(0);
      expect(profile.knownCountries).toBe(0);
    });

    it('should compute correct average amount', () => {
      service.recordTransaction({ userId: 'user_1', amount: 10 });
      service.recordTransaction({ userId: 'user_1', amount: 30 });
      service.recordTransaction({ userId: 'user_1', amount: 20 });

      const profile = service.getUserRiskProfile('user_1');
      expect(profile.averageAmount).toBe(20);
    });

    it('should count recent transactions within velocity window', () => {
      service.recordTransaction({ userId: 'user_1', amount: 10 });
      service.recordTransaction({ userId: 'user_1', amount: 20 });

      const profile = service.getUserRiskProfile('user_1');
      expect(profile.recentTransactions).toBe(2);
    });
  });

  describe('risk scoring', () => {
    it('should assign low risk for score 0-29', () => {
      const result = service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 10,
        currency: 'USD',
      });

      expect(result.riskLevel).toBe('low');
    });

    it('should assign review action for scores 30-49', () => {
      // Trigger geo anomaly (score 30)
      service.recordTransaction({ userId: 'user_1', amount: 10, country: 'US' });

      const result = service.checkTransaction({
        transactionId: 'txn_1',
        userId: 'user_1',
        amount: 10,
        currency: 'USD',
        country: 'RU',
      });

      expect(result.riskLevel).toBe('medium');
      expect(result.action).toBe('review');
    });
  });
});
