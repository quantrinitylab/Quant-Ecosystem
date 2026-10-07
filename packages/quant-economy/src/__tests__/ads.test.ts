import { describe, it, expect, beforeEach } from 'vitest';
import { CompanyAdManager } from '../ads/campaign-manager.js';
import { ImpressionClickTracker } from '../ads/impression-tracker.js';

describe('Company Ads', () => {
  let adManager: CompanyAdManager;
  let tracker: ImpressionClickTracker;

  beforeEach(() => {
    adManager = new CompanyAdManager();
    tracker = new ImpressionClickTracker(adManager, { cpmRate: 10, cpcRate: 2 });
  });

  it('should create a campaign with sponsored label', () => {
    const campaign = adManager.createCampaign('advertiser-1', 1000, { region: 'US' }, 'CPM');
    expect(campaign.sponsored).toBe(true);
    expect(campaign.status).toBe('active');
    expect(campaign.billingModel).toBe('CPM');
  });

  it('should record impressions for active campaign', () => {
    const campaign = adManager.createCampaign('advertiser-1', 1000, {}, 'CPM');
    tracker.recordImpression(campaign.id, 'viewer-1');
    tracker.recordImpression(campaign.id, 'viewer-2');
    const metrics = tracker.getCampaignMetrics(campaign.id);
    expect(metrics.impressions).toBe(2);
  });

  it('should record clicks for active campaign', () => {
    const campaign = adManager.createCampaign('advertiser-1', 1000, {}, 'CPC');
    tracker.recordImpression(campaign.id, 'viewer-1');
    tracker.recordClick(campaign.id, 'viewer-1');
    const metrics = tracker.getCampaignMetrics(campaign.id);
    expect(metrics.clicks).toBe(1);
  });

  it('should calculate CTR correctly', () => {
    const campaign = adManager.createCampaign('advertiser-1', 1000, {}, 'CPC');
    for (let i = 0; i < 100; i++) {
      tracker.recordImpression(campaign.id, `user-${i}`);
    }
    for (let i = 0; i < 5; i++) {
      tracker.recordClick(campaign.id, `user-${i}`);
    }
    const metrics = tracker.getCampaignMetrics(campaign.id);
    expect(metrics.ctr).toBeCloseTo(0.05);
  });

  it('should exhaust budget and stop serving', () => {
    const campaign = adManager.createCampaign('advertiser-1', 10, {}, 'CPC'); // $10 budget
    // Each click costs $2
    for (let i = 0; i < 10; i++) {
      tracker.recordClick(campaign.id, `user-${i}`);
    }
    // After 5 clicks ($10), budget is exhausted
    const metrics = tracker.getCampaignMetrics(campaign.id);
    expect(metrics.clicks).toBe(5); // only 5 succeeded
    const updatedCampaign = adManager.getCampaign(campaign.id);
    expect(updatedCampaign?.status).toBe('exhausted');
  });

  it('should not record impressions for paused campaign', () => {
    const campaign = adManager.createCampaign('advertiser-1', 1000, {}, 'CPM');
    adManager.pauseCampaign(campaign.id);
    const recorded = tracker.recordImpression(campaign.id, 'viewer-1');
    expect(recorded).toBe(false);
    const metrics = tracker.getCampaignMetrics(campaign.id);
    expect(metrics.impressions).toBe(0);
  });
});
