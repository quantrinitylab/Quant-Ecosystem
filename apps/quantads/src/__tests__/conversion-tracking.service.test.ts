import { describe, it, expect, beforeEach } from 'vitest';
import { ConversionTrackingService } from '../services/conversion-tracking.service';

describe('ConversionTrackingService', () => {
  let service: ConversionTrackingService;

  beforeEach(() => {
    service = new ConversionTrackingService();
  });

  describe('defineGoal', () => {
    it('should define a conversion goal', () => {
      const goal = service.defineGoal('Purchase', 49.99, 30, 'purchase_completed');
      expect(goal.id).toBeDefined();
      expect(goal.name).toBe('Purchase');
      expect(goal.value).toBe(49.99);
      expect(goal.window).toBe(30);
      expect(goal.eventName).toBe('purchase_completed');
    });
  });

  describe('deleteGoal', () => {
    it('should delete a goal', () => {
      const goal = service.defineGoal('Test', 10, 7, 'test');
      expect(service.deleteGoal(goal.id)).toBe(true);
      expect(service.getGoals()).toHaveLength(0);
    });

    it('should return false for non-existent goal', () => {
      expect(service.deleteGoal('fake')).toBe(false);
    });
  });

  describe('trackConversion', () => {
    it('should track a conversion', () => {
      const goal = service.defineGoal('Purchase', 49.99, 30, 'purchase');
      const conversion = service.trackConversion(goal.id, 'user-1', 'campaign-1');
      expect(conversion).not.toBeNull();
      expect(conversion?.goalId).toBe(goal.id);
      expect(conversion?.userId).toBe('user-1');
      expect(conversion?.campaignId).toBe('campaign-1');
      expect(conversion?.value).toBe(49.99);
    });

    it('should use custom value if provided', () => {
      const goal = service.defineGoal('Purchase', 49.99, 30, 'purchase');
      const conversion = service.trackConversion(goal.id, 'user-1', 'campaign-1', 99.99);
      expect(conversion?.value).toBe(99.99);
    });

    it('should return null for non-existent goal', () => {
      expect(service.trackConversion('fake', 'user-1', 'campaign-1')).toBeNull();
    });
  });

  describe('getConversionRate', () => {
    it('should calculate conversion rate', () => {
      const goal = service.defineGoal('Signup', 0, 7, 'signup');
      service.trackConversion(goal.id, 'user-1', 'campaign-1');
      service.trackConversion(goal.id, 'user-2', 'campaign-1');
      const rate = service.getConversionRate('campaign-1', goal.id);
      expect(rate).toBeGreaterThan(0);
    });

    it('should return 0 for no conversions', () => {
      const goal = service.defineGoal('Test', 10, 7, 'test');
      expect(service.getConversionRate('no-campaign', goal.id)).toBe(0);
    });
  });

  describe('getROI', () => {
    it('should calculate campaign ROI', () => {
      const goal = service.defineGoal('Purchase', 100, 30, 'purchase');
      service.trackConversion(goal.id, 'user-1', 'campaign-1');
      service.trackConversion(goal.id, 'user-2', 'campaign-1');

      const roi = service.getROI('campaign-1', 50);
      expect(roi.campaignId).toBe('campaign-1');
      expect(roi.spend).toBe(50);
      expect(roi.conversions).toBe(2);
      expect(roi.revenue).toBe(200);
      expect(roi.roi).toBe(3); // (200-50)/50
      expect(roi.costPerConversion).toBe(25);
    });

    it('should handle zero spend', () => {
      const roi = service.getROI('campaign-1', 0);
      expect(roi.roi).toBe(0);
    });

    it('should handle zero conversions', () => {
      const roi = service.getROI('no-campaign', 100);
      expect(roi.conversions).toBe(0);
      expect(roi.costPerConversion).toBe(0);
    });
  });

  describe('getConversions', () => {
    it('should return all conversions for a campaign', () => {
      const goal = service.defineGoal('G', 10, 7, 'e');
      service.trackConversion(goal.id, 'u1', 'c1');
      service.trackConversion(goal.id, 'u2', 'c1');
      service.trackConversion(goal.id, 'u3', 'c2');

      const conversions = service.getConversions('c1');
      expect(conversions).toHaveLength(2);
    });

    it('should filter by time range', () => {
      const goal = service.defineGoal('G', 10, 7, 'e');
      service.trackConversion(goal.id, 'u1', 'c1');
      const now = Date.now();
      const conversions = service.getConversions('c1', { start: now - 1000, end: now + 1000 });
      expect(conversions).toHaveLength(1);
    });

    it('should return empty for out-of-range', () => {
      const goal = service.defineGoal('G', 10, 7, 'e');
      service.trackConversion(goal.id, 'u1', 'c1');
      const conversions = service.getConversions('c1', { start: 0, end: 1 });
      expect(conversions).toHaveLength(0);
    });
  });

  describe('getGoals', () => {
    it('should return all defined goals', () => {
      service.defineGoal('A', 10, 7, 'a');
      service.defineGoal('B', 20, 14, 'b');
      expect(service.getGoals()).toHaveLength(2);
    });
  });
});
