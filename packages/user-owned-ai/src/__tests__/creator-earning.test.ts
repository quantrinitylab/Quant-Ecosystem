import { describe, expect, it } from 'vitest';
import { CreatorEarningService } from '../creator-earning.service.js';
import type { CreatorEarningEvent } from '../types.js';

describe('CreatorEarningService', () => {
  const now = Date.now();

  function makeEvent(overrides: Partial<CreatorEarningEvent> = {}): CreatorEarningEvent {
    return {
      creatorId: 'creator-1',
      userId: 'user-1',
      modelUsage: 'gpt-4o',
      appId: 'app-chat',
      earningAmount: 0.7,
      platformFee: 0.3,
      timestamp: now,
      ...overrides,
    };
  }

  it('records usage events', () => {
    const service = new CreatorEarningService();
    service.recordUsage(makeEvent());

    const earnings = service.getCreatorEarnings('creator-1');
    expect(earnings.eventCount).toBe(1);
    expect(earnings.totalEarnings).toBe(0.7);
  });

  it('calculates earning share with default 70/30 split', () => {
    const service = new CreatorEarningService();
    const share = service.calculateEarningShare(10.0);

    expect(share.creatorAmount).toBe(7.0);
    expect(share.platformAmount).toBe(3.0);
  });

  it('calculates earning share with custom split', () => {
    const service = new CreatorEarningService();
    const share = service.calculateEarningShare(10.0, 0.8);

    expect(share.creatorAmount).toBe(8.0);
    expect(share.platformAmount).toBe(2.0);
  });

  it('gets creator earnings for a period', () => {
    const service = new CreatorEarningService();
    service.recordUsage(makeEvent({ timestamp: now }));
    service.recordUsage(makeEvent({ timestamp: now - 86400000 * 5 }));
    service.recordUsage(makeEvent({ timestamp: now - 86400000 * 60 }));

    const earnings = service.getCreatorEarnings('creator-1', {
      start: now - 86400000 * 7,
      end: now + 1000,
    });

    expect(earnings.eventCount).toBe(2);
    expect(earnings.totalEarnings).toBeCloseTo(1.4, 2);
  });

  it('aggregates platform revenue', () => {
    const service = new CreatorEarningService();
    service.recordUsage(makeEvent({ platformFee: 0.3 }));
    service.recordUsage(makeEvent({ platformFee: 0.5, creatorId: 'creator-2' }));

    const revenue = service.getPlatformRevenue();
    expect(revenue).toBeCloseTo(0.8, 2);
  });

  it('aggregates platform revenue for a period', () => {
    const service = new CreatorEarningService();
    service.recordUsage(makeEvent({ platformFee: 0.3, timestamp: now }));
    service.recordUsage(makeEvent({ platformFee: 0.5, timestamp: now - 86400000 * 60 }));

    const revenue = service.getPlatformRevenue({
      start: now - 86400000 * 7,
      end: now + 1000,
    });
    expect(revenue).toBeCloseTo(0.3, 2);
  });

  it('handles multiple creators independently', () => {
    const service = new CreatorEarningService();
    service.recordUsage(makeEvent({ creatorId: 'creator-1', earningAmount: 1.0 }));
    service.recordUsage(makeEvent({ creatorId: 'creator-2', earningAmount: 2.0 }));

    const earnings1 = service.getCreatorEarnings('creator-1');
    const earnings2 = service.getCreatorEarnings('creator-2');

    expect(earnings1.totalEarnings).toBe(1.0);
    expect(earnings2.totalEarnings).toBe(2.0);
  });

  it('returns zero earnings for unknown creator', () => {
    const service = new CreatorEarningService();
    const earnings = service.getCreatorEarnings('unknown-creator');

    expect(earnings.eventCount).toBe(0);
    expect(earnings.totalEarnings).toBe(0);
  });
});
