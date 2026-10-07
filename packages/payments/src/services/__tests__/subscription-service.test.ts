import { describe, it, expect, beforeEach } from 'vitest';
import { SubscriptionService } from '../subscription-service';
import type { SubscriptionPlan } from '../../types';

const freePlan: SubscriptionPlan = {
  id: 'free',
  name: 'Free',
  description: 'Free tier',
  amount: 0,
  currency: 'USD',
  interval: 'monthly',
  intervalCount: 1,
  trialDays: 0,
  features: ['basic'],
  limits: { api_calls: 100, storage: 100 },
  active: true,
  metadata: {},
  createdAt: Date.now(),
};

const proPlan: SubscriptionPlan = {
  id: 'pro',
  name: 'Pro',
  description: 'Pro tier',
  amount: 9.99,
  currency: 'USD',
  interval: 'monthly',
  intervalCount: 1,
  trialDays: 14,
  features: ['basic', 'advanced'],
  limits: { api_calls: 10000, storage: 5000 },
  active: true,
  metadata: {},
  createdAt: Date.now(),
};

const enterprisePlan: SubscriptionPlan = {
  id: 'enterprise',
  name: 'Enterprise',
  description: 'Enterprise tier',
  amount: 49.99,
  currency: 'USD',
  interval: 'monthly',
  intervalCount: 1,
  trialDays: 0,
  features: ['basic', 'advanced', 'enterprise'],
  limits: { api_calls: 100000, storage: 50000 },
  active: true,
  metadata: {},
  createdAt: Date.now(),
};

const inactivePlan: SubscriptionPlan = {
  ...proPlan,
  id: 'legacy',
  name: 'Legacy',
  active: false,
};

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    service = new SubscriptionService();
    service.registerPlan(freePlan);
    service.registerPlan(proPlan);
    service.registerPlan(enterprisePlan);
    service.registerPlan(inactivePlan);
  });

  describe('create', () => {
    it('should create a subscription with trial', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro' });
      expect(sub.id).toMatch(/^sub_/);
      expect(sub.customerId).toBe('cust-1');
      expect(sub.planId).toBe('pro');
      expect(sub.status).toBe('trialing');
      expect(sub.trialEnd).toBeDefined();
      expect(sub.trialStart).toBeDefined();
      expect(sub.quantity).toBe(1);
      expect(sub.cancelAtPeriodEnd).toBe(false);
    });

    it('should create a subscription without trial when trialDays=0', async () => {
      const sub = await service.create({
        customerId: 'cust-1',
        planId: 'enterprise',
        trialDays: 0,
      });
      expect(sub.status).toBe('active');
      expect(sub.trialEnd).toBeUndefined();
    });

    it('should throw for non-existent plan', async () => {
      await expect(service.create({ customerId: 'cust-1', planId: 'nonexistent' })).rejects.toThrow(
        'Plan not found',
      );
    });

    it('should throw for inactive plan', async () => {
      await expect(service.create({ customerId: 'cust-1', planId: 'legacy' })).rejects.toThrow(
        'Plan is not active',
      );
    });

    it('should respect custom trial days', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 30 });
      expect(sub.status).toBe('trialing');
      const trialDuration = sub.trialEnd! - sub.trialStart!;
      expect(trialDuration).toBeCloseTo(30 * 86400000, -3);
    });

    it('should store metadata', async () => {
      const sub = await service.create({
        customerId: 'cust-1',
        planId: 'pro',
        metadata: { source: 'landing_page' },
      });
      expect(sub.metadata.source).toBe('landing_page');
    });
  });

  describe('upgrade', () => {
    it('should upgrade and calculate proration', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      const result = await service.upgrade(sub.id, 'enterprise');

      expect(result.subscription.planId).toBe('enterprise');
      expect(result.prorationAmount).toBeGreaterThanOrEqual(0);
    });

    it('should throw when upgrading to lower plan', async () => {
      const sub = await service.create({
        customerId: 'cust-1',
        planId: 'enterprise',
        trialDays: 0,
      });
      await expect(service.upgrade(sub.id, 'pro')).rejects.toThrow('New plan must be higher tier');
    });

    it('should throw for non-existent subscription', async () => {
      await expect(service.upgrade('nonexistent', 'enterprise')).rejects.toThrow(
        'Subscription not found',
      );
    });
  });

  describe('downgrade', () => {
    it('should downgrade and calculate credit', async () => {
      const sub = await service.create({
        customerId: 'cust-1',
        planId: 'enterprise',
        trialDays: 0,
      });
      const result = await service.downgrade(sub.id, 'pro');

      expect(result.subscription.planId).toBe('pro');
      expect(result.creditAmount).toBeGreaterThanOrEqual(0);
    });

    it('should throw when downgrading to higher plan', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      await expect(service.downgrade(sub.id, 'enterprise')).rejects.toThrow(
        'New plan must be lower tier',
      );
    });
  });

  describe('cancel', () => {
    it('should cancel at period end by default', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      const cancelled = await service.cancel(sub.id);
      expect(cancelled.cancelAtPeriodEnd).toBe(true);
      expect(cancelled.status).toBe('active');
    });

    it('should cancel immediately when specified', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      const cancelled = await service.cancel(sub.id, true);
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).toBeDefined();
    });
  });

  describe('pause and resume', () => {
    it('should pause an active subscription', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      const paused = await service.pause(sub.id);
      expect(paused.status).toBe('paused');
      expect(paused.pausedAt).toBeDefined();
    });

    it('should throw when pausing non-active subscription', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro' });
      await expect(service.pause(sub.id)).rejects.toThrow(
        'Cannot pause subscription with status: trialing',
      );
    });

    it('should resume a paused subscription', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      await service.pause(sub.id);
      const resumed = await service.resume(sub.id);
      expect(resumed.status).toBe('active');
      expect(resumed.pausedAt).toBeUndefined();
      expect(resumed.resumeAt).toBeUndefined();
    });

    it('should throw when resuming non-paused subscription', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      await expect(service.resume(sub.id)).rejects.toThrow(
        'Cannot resume subscription with status: active',
      );
    });

    it('should accept a resume date when pausing', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      const resumeDate = Date.now() + 30 * 86400000;
      const paused = await service.pause(sub.id, resumeDate);
      expect(paused.resumeAt).toBe(resumeDate);
    });
  });

  describe('applyTrial', () => {
    it('should apply trial to subscription without trial', async () => {
      const sub = await service.create({
        customerId: 'cust-1',
        planId: 'enterprise',
        trialDays: 0,
      });
      const result = await service.applyTrial(sub.id, 7);
      expect(result.status).toBe('trialing');
      expect(result.trialStart).toBeDefined();
      expect(result.trialEnd).toBeDefined();
    });

    it('should throw when trial already applied', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro' });
      await expect(service.applyTrial(sub.id, 7)).rejects.toThrow('already has a trial');
    });
  });

  describe('checkStatus', () => {
    it('should return status with days remaining', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      const status = await service.checkStatus(sub.id);
      expect(status.status).toBe('active');
      expect(status.daysRemaining).toBeGreaterThan(0);
      expect(status.isInGracePeriod).toBe(false);
    });

    it('should detect grace period for expired subscription', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      sub.currentPeriodEnd = Date.now() - 86400000;
      const status = await service.checkStatus(sub.id);
      expect(status.daysRemaining).toBe(0);
      expect(status.isInGracePeriod).toBe(true);
    });

    it('should mark as past_due when beyond grace period', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      sub.currentPeriodEnd = Date.now() - 10 * 86400000;
      const status = await service.checkStatus(sub.id);
      expect(status.status).toBe('past_due');
      expect(status.isInGracePeriod).toBe(false);
    });
  });

  describe('renewSubscription', () => {
    it('should renew and advance period', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      const originalEnd = sub.currentPeriodEnd;
      const renewed = await service.renewSubscription(sub.id);
      expect(renewed.currentPeriodStart).toBe(originalEnd);
      expect(renewed.currentPeriodEnd).toBeGreaterThan(originalEnd);
    });

    it('should cancel if cancelAtPeriodEnd is set', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      await service.cancel(sub.id);
      const renewed = await service.renewSubscription(sub.id);
      expect(renewed.status).toBe('cancelled');
    });

    it('should transition from trialing to active on renewal', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro' });
      expect(sub.status).toBe('trialing');
      const renewed = await service.renewSubscription(sub.id);
      expect(renewed.status).toBe('active');
    });
  });

  describe('getUpcomingInvoice', () => {
    it('should return invoice preview', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      const invoice = await service.getUpcomingInvoice(sub.id);
      expect(invoice.amount).toBe(9.99);
      expect(invoice.currency).toBe('USD');
      expect(invoice.lineItems).toHaveLength(1);
      expect(invoice.lineItems[0]!.description).toContain('Pro');
    });

    it('should account for quantity', async () => {
      const sub = await service.create({
        customerId: 'cust-1',
        planId: 'pro',
        trialDays: 0,
        quantity: 5,
      } as any);
      const invoice = await service.getUpcomingInvoice(sub.id);
      expect(invoice.amount).toBeCloseTo(9.99 * 5, 2);
    });
  });

  describe('recordUsage and getUsage', () => {
    it('should record and retrieve usage', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      await service.recordUsage(sub.id, 'api_calls', 500);
      await service.recordUsage(sub.id, 'api_calls', 300);

      const usage = await service.getUsage(sub.id);
      const apiUsage = usage.find((u) => u.feature === 'api_calls');
      expect(apiUsage).toBeDefined();
      expect(apiUsage!.used).toBe(800);
      expect(apiUsage!.limit).toBe(10000);
      expect(apiUsage!.percentage).toBe(8);
    });

    it('should handle new feature usage', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      await service.recordUsage(sub.id, 'new_feature', 10);

      const usage = await service.getUsage(sub.id);
      const feature = usage.find((u) => u.feature === 'new_feature');
      expect(feature).toBeDefined();
      expect(feature!.used).toBe(10);
      expect(feature!.limit).toBe(0);
      expect(feature!.percentage).toBe(0);
    });
  });

  describe('calculateProration', () => {
    it('should calculate proration based on remaining time', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      const proration = service.calculateProration(sub, proPlan, enterprisePlan);
      expect(proration).toBeGreaterThan(0);
    });

    it('should return 0 when period is fully consumed', async () => {
      const sub = await service.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      sub.currentPeriodStart = Date.now() - 30 * 86400000;
      sub.currentPeriodEnd = Date.now() - 1;
      const proration = service.calculateProration(sub, proPlan, enterprisePlan);
      expect(proration).toBeCloseTo(0, 0);
    });
  });

  describe('plan change limits', () => {
    it('should enforce max plan changes per month', async () => {
      const customService = new SubscriptionService({ maxPlanChangesPerMonth: 2 });
      customService.registerPlan(freePlan);
      customService.registerPlan(proPlan);
      customService.registerPlan(enterprisePlan);

      const sub = await customService.create({ customerId: 'cust-1', planId: 'pro', trialDays: 0 });
      await customService.upgrade(sub.id, 'enterprise');
      await customService.downgrade(sub.id, 'pro');

      await expect(customService.upgrade(sub.id, 'enterprise')).rejects.toThrow(
        'Maximum plan changes per month exceeded',
      );
    });
  });
});
