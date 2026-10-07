import { describe, it, expect, beforeEach } from 'vitest';
import { AudienceLookalikeService } from '../services/audience-lookalike.service';

describe('AudienceLookalikeService', () => {
  let service: AudienceLookalikeService;

  beforeEach(() => {
    service = new AudienceLookalikeService();
  });

  describe('addAudience', () => {
    it('should add an audience', () => {
      const audience = service.addAudience('Tech Enthusiasts', 10000, {
        techInterest: 0.9,
        age25_34: 0.7,
      });
      expect(audience.id).toBeDefined();
      expect(audience.name).toBe('Tech Enthusiasts');
      expect(audience.size).toBe(10000);
    });
  });

  describe('createLookalike', () => {
    it('should create a lookalike audience', () => {
      const source = service.addAudience('Source', 5000, { interest: 0.8 });
      const lookalike = service.createLookalike(source.id, 3);
      expect(lookalike).not.toBeNull();
      expect(lookalike?.sourceAudienceId).toBe(source.id);
      expect(lookalike?.estimatedSize).toBe(15000);
      expect(lookalike?.matchScore).toBeGreaterThan(0);
      expect(lookalike?.matchScore).toBeLessThanOrEqual(1);
    });

    it('should return null for non-existent source', () => {
      expect(service.createLookalike('fake', 2)).toBeNull();
    });

    it('should decrease match score with higher expansion', () => {
      const source = service.addAudience('Source', 5000, { interest: 0.8 });
      const small = service.createLookalike(source.id, 2);
      const large = service.createLookalike(source.id, 5);
      expect(small!.matchScore).toBeGreaterThan(large!.matchScore);
    });
  });

  describe('getMatchScore', () => {
    it('should return high score for similar traits', () => {
      const source = service.addAudience('Source', 1000, { a: 0.8, b: 0.6 });
      const score = service.getMatchScore(source.id, { a: 0.8, b: 0.6 });
      expect(score).toBeGreaterThan(0.9);
    });

    it('should return lower score for different traits', () => {
      const source = service.addAudience('Source', 1000, { a: 0.9, b: 0.1 });
      const score = service.getMatchScore(source.id, { a: 0.1, b: 0.9 });
      expect(score).toBeLessThan(0.5);
    });

    it('should return 0 for non-existent source', () => {
      expect(service.getMatchScore('fake', { a: 0.5 })).toBe(0);
    });
  });

  describe('estimateReach', () => {
    it('should calculate estimated reach', () => {
      const source = service.addAudience('Source', 2000, {});
      expect(service.estimateReach(source.id, 4)).toBe(8000);
    });

    it('should return 0 for non-existent source', () => {
      expect(service.estimateReach('fake', 2)).toBe(0);
    });
  });

  describe('getLookalikes', () => {
    it('should return lookalikes for a source', () => {
      const source = service.addAudience('S', 1000, {});
      service.createLookalike(source.id, 2);
      service.createLookalike(source.id, 3);
      expect(service.getLookalikes(source.id)).toHaveLength(2);
    });

    it('should return empty for audience with no lookalikes', () => {
      const source = service.addAudience('S', 1000, {});
      expect(service.getLookalikes(source.id)).toHaveLength(0);
    });
  });

  describe('deleteLookalike', () => {
    it('should delete a lookalike', () => {
      const source = service.addAudience('S', 1000, {});
      const la = service.createLookalike(source.id, 2)!;
      expect(service.deleteLookalike(la.id)).toBe(true);
      expect(service.getLookalikes(source.id)).toHaveLength(0);
    });

    it('should return false for non-existent id', () => {
      expect(service.deleteLookalike('fake')).toBe(false);
    });
  });

  describe('getSourceAudience', () => {
    it('should return source audience by id', () => {
      const audience = service.addAudience('Test', 500, { x: 0.5 });
      expect(service.getSourceAudience(audience.id)?.name).toBe('Test');
    });

    it('should return null for non-existent id', () => {
      expect(service.getSourceAudience('fake')).toBeNull();
    });
  });
});
