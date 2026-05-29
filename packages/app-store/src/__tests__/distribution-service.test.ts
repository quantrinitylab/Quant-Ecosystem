import { describe, it, expect, beforeEach } from 'vitest';
import { DistributionService } from '../distribution/distribution-service.js';

describe('DistributionService', () => {
  let service: DistributionService;

  beforeEach(() => {
    service = new DistributionService();
  });

  describe('distribute', () => {
    it('should distribute an app to multiple contexts', () => {
      const target = service.distribute('app-1', ['mobile', 'desktop', 'web']);

      expect(target.appId).toBe('app-1');
      expect(target.contexts).toEqual(['mobile', 'desktop', 'web']);
      expect(target.visibility).toBe('public');
    });

    it('should merge contexts on repeated distribute', () => {
      service.distribute('app-1', ['mobile', 'desktop']);
      const target = service.distribute('app-1', ['web', 'tv']);

      expect(target.contexts).toContain('mobile');
      expect(target.contexts).toContain('desktop');
      expect(target.contexts).toContain('web');
      expect(target.contexts).toContain('tv');
    });

    it('should not duplicate contexts', () => {
      service.distribute('app-1', ['mobile', 'desktop']);
      const target = service.distribute('app-1', ['mobile', 'web']);

      const mobileCount = target.contexts.filter((c) => c === 'mobile').length;
      expect(mobileCount).toBe(1);
    });
  });

  describe('retract', () => {
    it('should remove a context from distribution', () => {
      service.distribute('app-1', ['mobile', 'desktop', 'web']);
      service.retract('app-1', 'desktop');

      const target = service.getTargets('app-1');
      expect(target!.contexts).not.toContain('desktop');
      expect(target!.contexts).toContain('mobile');
      expect(target!.contexts).toContain('web');
    });

    it('should return false for non-existent app', () => {
      expect(service.retract('non-existent', 'mobile')).toBe(false);
    });

    it('should handle retracting non-existent context gracefully', () => {
      service.distribute('app-1', ['mobile']);
      const result = service.retract('app-1', 'desktop');

      expect(result).toBe(true);
      const target = service.getTargets('app-1');
      expect(target!.contexts).toEqual(['mobile']);
    });
  });

  describe('getTargets', () => {
    it('should return targets for distributed app', () => {
      service.distribute('app-1', ['mobile', 'web']);
      const target = service.getTargets('app-1');

      expect(target).not.toBeNull();
      expect(target!.appId).toBe('app-1');
    });

    it('should return null for non-distributed app', () => {
      expect(service.getTargets('unknown')).toBeNull();
    });
  });

  describe('getAppsForContext', () => {
    it('should return all apps available in a context', () => {
      service.distribute('app-1', ['mobile', 'web']);
      service.distribute('app-2', ['mobile', 'desktop']);
      service.distribute('app-3', ['desktop', 'web']);

      const mobileApps = service.getAppsForContext('mobile');
      expect(mobileApps.length).toBe(2);
      expect(mobileApps.map((t) => t.appId)).toContain('app-1');
      expect(mobileApps.map((t) => t.appId)).toContain('app-2');
    });

    it('should return empty for context with no apps', () => {
      service.distribute('app-1', ['mobile']);
      expect(service.getAppsForContext('tv')).toEqual([]);
    });

    it('should not include retracted apps', () => {
      service.distribute('app-1', ['mobile', 'web']);
      service.retract('app-1', 'mobile');

      const mobileApps = service.getAppsForContext('mobile');
      expect(mobileApps.length).toBe(0);
    });
  });

  describe('syncAvailability', () => {
    it('should return updated targets after sync', () => {
      service.distribute('app-1', ['mobile', 'web']);
      const synced = service.syncAvailability('app-1');

      expect(synced).not.toBeNull();
      expect(synced!.contexts.length).toBe(2);
    });

    it('should return null for non-existent app', () => {
      expect(service.syncAvailability('unknown')).toBeNull();
    });
  });

  describe('visibility and restrictions', () => {
    it('should allow setting visibility', () => {
      service.distribute('app-1', ['mobile']);
      service.setVisibility('app-1', 'restricted');

      const target = service.getTargets('app-1');
      expect(target!.visibility).toBe('restricted');
    });

    it('should allow adding restrictions', () => {
      service.distribute('app-1', ['mobile']);
      service.addRestriction('app-1', 'age-18+');
      service.addRestriction('app-1', 'region-us-only');

      const target = service.getTargets('app-1');
      expect(target!.restrictions).toContain('age-18+');
      expect(target!.restrictions).toContain('region-us-only');
    });
  });
});
