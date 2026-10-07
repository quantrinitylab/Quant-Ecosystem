// ============================================================================
// Payments - Fraud Detection Service
// Velocity checks, amount anomaly detection, device/geo tracking, risk scoring
// ============================================================================

import { z } from 'zod';
import type { FraudCheckResult, FraudRiskLevel, FraudSignal } from '../types';

export const CheckTransactionSchema = z.object({
  transactionId: z.string().min(1),
  userId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  deviceFingerprint: z.string().optional(),
  ipAddress: z.string().optional(),
  country: z.string().optional(),
});

interface TransactionRecord {
  userId: string;
  amount: number;
  deviceFingerprint?: string;
  ipAddress?: string;
  country?: string;
  timestamp: number;
}

interface FraudDetectionConfig {
  velocityWindowMs: number;
  maxTransactionsInWindow: number;
  amountAnomalyMultiplier: number;
  riskThresholds: { flag: number; block: number };
  /** Maximum number of transaction history entries to retain per user. Oldest entries are evicted when exceeded. Default: 1000. */
  maxHistoryPerUser?: number;
}

/**
 * FraudDetectionService - Real-time fraud analysis
 *
 * Performs velocity checks (too many transactions in short period),
 * amount anomaly detection (sudden large transactions vs user history),
 * geographic anomaly (transactions from unusual locations),
 * and device fingerprint tracking.
 */
export class FraudDetectionService {
  private readonly config: FraudDetectionConfig & { maxHistoryPerUser: number };
  private readonly transactionHistory: Map<string, TransactionRecord[]> = new Map();
  private readonly userDevices: Map<string, Set<string>> = new Map();
  private readonly userCountries: Map<string, Set<string>> = new Map();

  constructor(config: FraudDetectionConfig) {
    this.config = { ...config, maxHistoryPerUser: config.maxHistoryPerUser ?? 1000 };
  }

  /**
   * Check a transaction for fraud signals
   */
  checkTransaction(params: {
    transactionId: string;
    userId: string;
    amount: number;
    currency: string;
    deviceFingerprint?: string;
    ipAddress?: string;
    country?: string;
  }): FraudCheckResult {
    const validated = CheckTransactionSchema.parse(params);
    const signals: FraudSignal[] = [];
    const now = Date.now();

    // Velocity check
    const velocitySignal = this.checkVelocity(validated.userId, now);
    if (velocitySignal) {
      signals.push(velocitySignal);
    }

    // Amount anomaly check
    const amountSignal = this.checkAmountAnomaly(validated.userId, validated.amount, now);
    if (amountSignal) {
      signals.push(amountSignal);
    }

    // Device fingerprint anomaly
    if (validated.deviceFingerprint) {
      const deviceSignal = this.checkDeviceAnomaly(
        validated.userId,
        validated.deviceFingerprint,
        now,
      );
      if (deviceSignal) {
        signals.push(deviceSignal);
      }
    }

    // Geographic anomaly
    if (validated.country) {
      const geoSignal = this.checkGeoAnomaly(validated.userId, validated.country, now);
      if (geoSignal) {
        signals.push(geoSignal);
      }
    }

    // Compute risk score (0-100)
    const riskScore = Math.min(
      100,
      signals.reduce((sum, s) => sum + s.score, 0),
    );
    const riskLevel = this.computeRiskLevel(riskScore);
    const action = this.computeAction(riskScore);

    // Auto-record the transaction so the fraud model stays up to date
    this.recordTransaction({
      userId: validated.userId,
      amount: validated.amount,
      deviceFingerprint: validated.deviceFingerprint,
      ipAddress: validated.ipAddress,
      country: validated.country,
    });

    return {
      transactionId: validated.transactionId,
      riskLevel,
      riskScore,
      signals,
      action,
      checkedAt: now,
    };
  }

  /**
   * Record a completed transaction for future analysis
   */
  recordTransaction(params: {
    userId: string;
    amount: number;
    deviceFingerprint?: string;
    ipAddress?: string;
    country?: string;
  }): void {
    const record: TransactionRecord = {
      userId: params.userId,
      amount: params.amount,
      deviceFingerprint: params.deviceFingerprint,
      ipAddress: params.ipAddress,
      country: params.country,
      timestamp: Date.now(),
    };

    // Per-user history with eviction
    if (!this.transactionHistory.has(params.userId)) {
      this.transactionHistory.set(params.userId, []);
    }
    const userHistory = this.transactionHistory.get(params.userId)!;
    userHistory.push(record);

    // Evict oldest entries when exceeding maxHistoryPerUser
    if (userHistory.length > this.config.maxHistoryPerUser) {
      userHistory.splice(0, userHistory.length - this.config.maxHistoryPerUser);
    }

    // Track devices
    if (params.deviceFingerprint) {
      if (!this.userDevices.has(params.userId)) {
        this.userDevices.set(params.userId, new Set());
      }
      this.userDevices.get(params.userId)!.add(params.deviceFingerprint);
    }

    // Track countries
    if (params.country) {
      if (!this.userCountries.has(params.userId)) {
        this.userCountries.set(params.userId, new Set());
      }
      this.userCountries.get(params.userId)!.add(params.country);
    }
  }

  /**
   * Get risk profile summary for a user
   */
  getUserRiskProfile(userId: string): {
    totalTransactions: number;
    averageAmount: number;
    knownDevices: number;
    knownCountries: number;
    recentTransactions: number;
  } {
    const userTransactions = this.transactionHistory.get(userId) ?? [];
    const now = Date.now();
    const recentTransactions = userTransactions.filter(
      (t) => now - t.timestamp <= this.config.velocityWindowMs,
    );

    const totalAmount = userTransactions.reduce((sum, t) => sum + t.amount, 0);
    const averageAmount = userTransactions.length > 0 ? totalAmount / userTransactions.length : 0;

    return {
      totalTransactions: userTransactions.length,
      averageAmount,
      knownDevices: this.userDevices.get(userId)?.size ?? 0,
      knownCountries: this.userCountries.get(userId)?.size ?? 0,
      recentTransactions: recentTransactions.length,
    };
  }

  private checkVelocity(userId: string, now: number): FraudSignal | null {
    const windowStart = now - this.config.velocityWindowMs;
    const userHistory = this.transactionHistory.get(userId) ?? [];
    const recentCount = userHistory.filter((t) => t.timestamp >= windowStart).length;

    if (recentCount >= this.config.maxTransactionsInWindow) {
      return {
        type: 'velocity',
        score: 40,
        description: `${recentCount} transactions in velocity window (max: ${this.config.maxTransactionsInWindow})`,
        timestamp: now,
      };
    }

    return null;
  }

  private checkAmountAnomaly(userId: string, amount: number, now: number): FraudSignal | null {
    const userTransactions = this.transactionHistory.get(userId) ?? [];

    if (userTransactions.length < 3) {
      return null; // Not enough history to detect anomaly
    }

    const totalAmount = userTransactions.reduce((sum, t) => sum + t.amount, 0);
    const averageAmount = totalAmount / userTransactions.length;
    const threshold = averageAmount * this.config.amountAnomalyMultiplier;

    if (amount > threshold) {
      return {
        type: 'amount_anomaly',
        score: 35,
        description: `Amount ${amount} exceeds ${this.config.amountAnomalyMultiplier}x average (${averageAmount.toFixed(2)})`,
        timestamp: now,
      };
    }

    return null;
  }

  private checkDeviceAnomaly(
    userId: string,
    deviceFingerprint: string,
    now: number,
  ): FraudSignal | null {
    const knownDevices = this.userDevices.get(userId);

    if (knownDevices && knownDevices.size > 0 && !knownDevices.has(deviceFingerprint)) {
      return {
        type: 'device_anomaly',
        score: 25,
        description: `New device fingerprint detected (known: ${knownDevices.size})`,
        timestamp: now,
      };
    }

    return null;
  }

  private checkGeoAnomaly(userId: string, country: string, now: number): FraudSignal | null {
    const knownCountries = this.userCountries.get(userId);

    if (knownCountries && knownCountries.size > 0 && !knownCountries.has(country)) {
      return {
        type: 'geo_anomaly',
        score: 30,
        description: `Transaction from new country: ${country} (known: ${Array.from(knownCountries).join(', ')})`,
        timestamp: now,
      };
    }

    return null;
  }

  private computeRiskLevel(score: number): FraudRiskLevel {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  private computeAction(score: number): 'allow' | 'flag' | 'block' | 'review' {
    if (score >= this.config.riskThresholds.block) return 'block';
    if (score >= this.config.riskThresholds.flag) return 'flag';
    if (score >= 30) return 'review';
    return 'allow';
  }
}
