// ============================================================================
// Data Pipeline Package - Revenue Pipeline
// ============================================================================

import type {
  RevenueMetrics,
  MRRMovement,
  LTVEstimate,
  CACMetrics,
  QuickRatio,
} from '../types';

/** Subscription record */
interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  monthlyAmount: number;
  status: SubscriptionStatus;
  startDate: number;
  endDate: number | null;
  cancelledAt: number | null;
  previousAmount: number | null;
  segment: string;
  channel: string;
}

/** Subscription status */
type SubscriptionStatus = 'active' | 'cancelled' | 'paused' | 'expired' | 'trial';

/** Marketing spend record */
interface MarketingSpend {
  channel: string;
  amount: number;
  period: string;
  customersAcquired: number;
}

/** Revenue event for tracking changes */
interface RevenueEvent {
  type: 'new' | 'expansion' | 'contraction' | 'churn' | 'reactivation';
  customerId: string;
  subscriptionId: string;
  amount: number;
  previousAmount: number;
  timestamp: number;
  period: string;
}

/**
 * RevenuePipeline - SaaS revenue metrics calculator
 * Calculates MRR/ARR, MRR movements, LTV estimation,
 * CAC tracking, and Quick Ratio for business health.
 */
export class RevenuePipeline {
  private subscriptions: Map<string, Subscription> = new Map();
  private revenueEvents: RevenueEvent[] = [];
  private marketingSpends: MarketingSpend[] = [];
  private subscriptionCounter: number = 0;

  /**
   * Add or update a subscription
   */
  public addSubscription(
    customerId: string,
    planId: string,
    monthlyAmount: number,
    channel: string = 'organic',
    segment: string = 'default',
    startDate: number = Date.now()
  ): Subscription {
    const id = `sub-${++this.subscriptionCounter}-${Date.now()}`;

    const subscription: Subscription = {
      id,
      customerId,
      planId,
      monthlyAmount,
      status: 'active',
      startDate,
      endDate: null,
      cancelledAt: null,
      previousAmount: null,
      segment,
      channel,
    };

    this.subscriptions.set(id, subscription);

    // Record new revenue event
    this.revenueEvents.push({
      type: 'new',
      customerId,
      subscriptionId: id,
      amount: monthlyAmount,
      previousAmount: 0,
      timestamp: startDate,
      period: this.getPeriodKey(startDate),
    });

    return subscription;
  }

  /**
   * Cancel a subscription (churn)
   */
  public cancelSubscription(subscriptionId: string, cancelDate: number = Date.now()): void {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return;

    sub.status = 'cancelled';
    sub.cancelledAt = cancelDate;
    sub.endDate = cancelDate;

    this.revenueEvents.push({
      type: 'churn',
      customerId: sub.customerId,
      subscriptionId,
      amount: sub.monthlyAmount,
      previousAmount: sub.monthlyAmount,
      timestamp: cancelDate,
      period: this.getPeriodKey(cancelDate),
    });
  }

  /**
   * Update subscription amount (expansion or contraction)
   */
  public updateSubscription(subscriptionId: string, newAmount: number, changeDate: number = Date.now()): void {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return;

    const previousAmount = sub.monthlyAmount;
    sub.previousAmount = previousAmount;
    sub.monthlyAmount = newAmount;

    const type = newAmount > previousAmount ? 'expansion' : 'contraction';

    this.revenueEvents.push({
      type,
      customerId: sub.customerId,
      subscriptionId,
      amount: Math.abs(newAmount - previousAmount),
      previousAmount,
      timestamp: changeDate,
      period: this.getPeriodKey(changeDate),
    });
  }

  /**
   * Reactivate a cancelled subscription
   */
  public reactivateSubscription(
    subscriptionId: string,
    newAmount?: number,
    reactivateDate: number = Date.now()
  ): void {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return;

    const amount = newAmount ?? sub.monthlyAmount;
    sub.status = 'active';
    sub.cancelledAt = null;
    sub.endDate = null;
    sub.monthlyAmount = amount;

    this.revenueEvents.push({
      type: 'reactivation',
      customerId: sub.customerId,
      subscriptionId,
      amount,
      previousAmount: 0,
      timestamp: reactivateDate,
      period: this.getPeriodKey(reactivateDate),
    });
  }

  /**
   * Record marketing spend for CAC calculation
   */
  public recordMarketingSpend(
    channel: string,
    amount: number,
    customersAcquired: number,
    period: string
  ): void {
    this.marketingSpends.push({ channel, amount, period, customersAcquired });
  }

  /**
   * Calculate current Monthly Recurring Revenue
   */
  public calculateMRR(asOfDate: number = Date.now()): number {
    let mrr = 0;

    for (const sub of this.subscriptions.values()) {
      if (this.isActiveAt(sub, asOfDate)) {
        mrr += sub.monthlyAmount;
      }
    }

    return mrr;
  }

  /**
   * Calculate Annual Recurring Revenue (MRR * 12)
   */
  public calculateARR(asOfDate: number = Date.now()): number {
    return this.calculateMRR(asOfDate) * 12;
  }

  /**
   * Estimate Customer Lifetime Value
   */
  public estimateLTV(segment?: string): LTVEstimate {
    const relevantSubs = Array.from(this.subscriptions.values())
      .filter(s => !segment || s.segment === segment);

    if (relevantSubs.length === 0) {
      return {
        segment: segment ?? 'all',
        averageLTV: 0,
        medianLTV: 0,
        averageLifespan: 0,
        averageMonthlyRevenue: 0,
        churnRate: 0,
        confidenceInterval: [0, 0],
      };
    }

    // Calculate average monthly revenue
    const monthlyRevenues = relevantSubs.map(s => s.monthlyAmount);
    const avgMonthlyRevenue = monthlyRevenues.reduce((a, b) => a + b, 0) / monthlyRevenues.length;

    // Calculate churn rate
    const totalSubs = relevantSubs.length;
    const cancelledSubs = relevantSubs.filter(s => s.status === 'cancelled').length;
    const churnRate = totalSubs > 0 ? cancelledSubs / totalSubs : 0;

    // Average lifespan in months
    const lifespans = relevantSubs.map(s => {
      const end = s.endDate ?? Date.now();
      return (end - s.startDate) / (30 * 24 * 60 * 60 * 1000);
    });
    const avgLifespan = lifespans.reduce((a, b) => a + b, 0) / lifespans.length;

    // LTV = ARPU / Monthly Churn Rate (simplified)
    const monthlyChurnRate = churnRate > 0 ? churnRate : 0.05; // Default 5% if no data
    const averageLTV = avgMonthlyRevenue / monthlyChurnRate;

    // Calculate median LTV
    const ltvValues = lifespans.map(l => l * avgMonthlyRevenue).sort((a, b) => a - b);
    const medianLTV = ltvValues[Math.floor(ltvValues.length / 2)] ?? 0;

    // Confidence interval (simple approximation)
    const stdDev = Math.sqrt(
      ltvValues.reduce((sum, v) => sum + Math.pow(v - averageLTV, 2), 0) / ltvValues.length
    );
    const margin = 1.96 * (stdDev / Math.sqrt(ltvValues.length));

    return {
      segment: segment ?? 'all',
      averageLTV,
      medianLTV,
      averageLifespan: avgLifespan,
      averageMonthlyRevenue: avgMonthlyRevenue,
      churnRate,
      confidenceInterval: [averageLTV - margin, averageLTV + margin],
    };
  }

  /**
   * Track Customer Acquisition Cost per channel
   */
  public trackCAC(period?: string): CACMetrics[] {
    const spendsByChannel = new Map<string, { totalSpend: number; customers: number }>();

    const spends = period
      ? this.marketingSpends.filter(s => s.period === period)
      : this.marketingSpends;

    for (const spend of spends) {
      const existing = spendsByChannel.get(spend.channel) ?? { totalSpend: 0, customers: 0 };
      existing.totalSpend += spend.amount;
      existing.customers += spend.customersAcquired;
      spendsByChannel.set(spend.channel, existing);
    }

    const results: CACMetrics[] = [];
    for (const [channel, data] of spendsByChannel.entries()) {
      const cac = data.customers > 0 ? data.totalSpend / data.customers : 0;

      // Calculate payback period (months to recover CAC)
      const channelSubs = Array.from(this.subscriptions.values())
        .filter(s => s.channel === channel);
      const avgRevenue = channelSubs.length > 0
        ? channelSubs.reduce((sum, s) => sum + s.monthlyAmount, 0) / channelSubs.length
        : 0;
      const paybackPeriod = avgRevenue > 0 ? cac / avgRevenue : 0;

      // ROI = (LTV - CAC) / CAC
      const ltv = this.estimateLTV().averageLTV;
      const roi = cac > 0 ? (ltv - cac) / cac : 0;

      results.push({
        channel,
        totalSpend: data.totalSpend,
        customersAcquired: data.customers,
        cac,
        paybackPeriod,
        roi,
      });
    }

    return results;
  }

  /**
   * Calculate Quick Ratio: (New + Expansion) / (Contraction + Churn)
   */
  public getQuickRatio(period?: string): QuickRatio {
    const targetPeriod = period ?? this.getPeriodKey(Date.now());
    const periodEvents = this.revenueEvents.filter(e => e.period === targetPeriod);

    let newMRR = 0;
    let expansionMRR = 0;
    let contractionMRR = 0;
    let churnMRR = 0;

    for (const event of periodEvents) {
      switch (event.type) {
        case 'new':
          newMRR += event.amount;
          break;
        case 'expansion':
          expansionMRR += event.amount;
          break;
        case 'contraction':
          contractionMRR += event.amount;
          break;
        case 'churn':
          churnMRR += event.amount;
          break;
        case 'reactivation':
          newMRR += event.amount; // Count as new for quick ratio
          break;
      }
    }

    const denominator = contractionMRR + churnMRR;
    const ratio = denominator > 0 ? (newMRR + expansionMRR) / denominator : Infinity;

    return {
      period: targetPeriod,
      newMRR,
      expansionMRR,
      contractionMRR,
      churnMRR,
      ratio: isFinite(ratio) ? ratio : 999,
      healthy: ratio > 4, // Quick Ratio > 4 is considered healthy
    };
  }

  /**
   * Get MRR movements for a period
   */
  public getMRRMovements(period?: string): MRRMovement {
    const targetPeriod = period ?? this.getPeriodKey(Date.now());
    const periodEvents = this.revenueEvents.filter(e => e.period === targetPeriod);

    let newMRR = 0;
    let expansionMRR = 0;
    let contractionMRR = 0;
    let churnMRR = 0;
    let reactivationMRR = 0;

    for (const event of periodEvents) {
      switch (event.type) {
        case 'new':
          newMRR += event.amount;
          break;
        case 'expansion':
          expansionMRR += event.amount;
          break;
        case 'contraction':
          contractionMRR += event.amount;
          break;
        case 'churn':
          churnMRR += event.amount;
          break;
        case 'reactivation':
          reactivationMRR += event.amount;
          break;
      }
    }

    const netNewMRR = newMRR + expansionMRR + reactivationMRR - contractionMRR - churnMRR;

    return {
      period: targetPeriod,
      newMRR,
      expansionMRR,
      contractionMRR,
      churnMRR,
      reactivationMRR,
      netNewMRR,
      totalMRR: this.calculateMRR(),
    };
  }

  /**
   * Get comprehensive revenue metrics snapshot
   */
  public getRevenueMetrics(date: number = Date.now()): RevenueMetrics {
    const mrr = this.calculateMRR(date);
    const arr = mrr * 12;
    const ltv = this.estimateLTV();
    const quickRatio = this.getQuickRatio();
    const cacMetrics = this.trackCAC();

    const activeCustomers = Array.from(this.subscriptions.values())
      .filter(s => this.isActiveAt(s, date))
      .length;
    const payingCustomers = Array.from(this.subscriptions.values())
      .filter(s => this.isActiveAt(s, date) && s.monthlyAmount > 0)
      .length;

    const arpu = activeCustomers > 0 ? mrr / activeCustomers : 0;
    const arppu = payingCustomers > 0 ? mrr / payingCustomers : 0;

    const totalCAC = cacMetrics.reduce((sum, c) => sum + c.cac, 0) / Math.max(cacMetrics.length, 1);

    return {
      mrr,
      arr,
      arpu,
      arppu,
      ltv: ltv.averageLTV,
      cac: totalCAC,
      ltvCacRatio: totalCAC > 0 ? ltv.averageLTV / totalCAC : 0,
      quickRatio: quickRatio.ratio,
      date,
    };
  }

  /**
   * Check if a subscription is active at a given date
   */
  private isActiveAt(sub: Subscription, date: number): boolean {
    if (sub.startDate > date) return false;
    if (sub.status === 'cancelled' && sub.endDate && sub.endDate <= date) return false;
    if (sub.status === 'expired') return false;
    return sub.status === 'active' || sub.status === 'trial';
  }

  /**
   * Get period key (YYYY-MM format)
   */
  private getPeriodKey(timestamp: number): string {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
