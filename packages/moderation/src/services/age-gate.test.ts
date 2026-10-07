import { describe, it, expect, beforeEach } from 'vitest';
import { AgeGateService } from './age-gate';

describe('AgeGateService', () => {
  let service: AgeGateService;

  beforeEach(() => {
    service = new AgeGateService();
  });

  describe('age group classification', () => {
    it('should classify 10-year-old as under13', () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 10);
      const result = service.verifyAge(dob);
      expect(result.ageGroup).toBe('under13');
    });

    it('should classify 14-year-old as under16', () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 14);
      const result = service.verifyAge(dob);
      expect(result.ageGroup).toBe('under16');
    });

    it('should classify 17-year-old as under18', () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 17);
      const result = service.verifyAge(dob);
      expect(result.ageGroup).toBe('under18');
    });

    it('should classify 21-year-old as adult', () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 21);
      const result = service.verifyAge(dob);
      expect(result.ageGroup).toBe('adult');
    });

    it('should classify 18-year-old as adult', () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 18);
      // Ensure birthday has passed this year
      dob.setMonth(0);
      dob.setDate(1);
      const result = service.verifyAge(dob);
      expect(result.ageGroup).toBe('adult');
    });

    it('should classify 12-year-old as under13', () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 12);
      const result = service.verifyAge(dob);
      expect(result.ageGroup).toBe('under13');
    });
  });

  describe('feature restrictions for under-18', () => {
    it('should restrict random chat for under-18', () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 17);
      const result = service.verifyAge(dob);
      expect(result.restrictions).toContain('random_chat');
    });

    it('should restrict dating for under-18', () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 17);
      const result = service.verifyAge(dob);
      expect(result.restrictions).toContain('dating');
    });

    it('should not restrict messaging for under-18', () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 17);
      const result = service.verifyAge(dob);
      expect(result.restrictions).not.toContain('direct_messages');
    });

    it('should not restrict any features for adults', () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 25);
      const result = service.verifyAge(dob);
      expect(result.restrictions).toHaveLength(0);
    });
  });

  describe('feature restrictions for under-16', () => {
    it('should restrict random chat for under-16', () => {
      const restrictions = service.getRestrictedFeatures('under16');
      expect(restrictions).toContain('random_chat');
    });

    it('should restrict dating for under-16', () => {
      const restrictions = service.getRestrictedFeatures('under16');
      expect(restrictions).toContain('dating');
    });

    it('should restrict live streaming for under-16', () => {
      const restrictions = service.getRestrictedFeatures('under16');
      expect(restrictions).toContain('live_streaming');
    });

    it('should restrict marketplace for under-16', () => {
      const restrictions = service.getRestrictedFeatures('under16');
      expect(restrictions).toContain('marketplace');
    });
  });

  describe('feature restrictions for under-13', () => {
    it('should restrict almost everything for under-13', () => {
      const restrictions = service.getRestrictedFeatures('under13');
      expect(restrictions).toContain('random_chat');
      expect(restrictions).toContain('dating');
      expect(restrictions).toContain('direct_messages');
      expect(restrictions).toContain('live_streaming');
      expect(restrictions).toContain('marketplace');
      expect(restrictions).toContain('payments');
      expect(restrictions).toContain('video_calls');
      expect(restrictions).toContain('location_sharing');
    });

    it('should have more restrictions than under-16', () => {
      const under13 = service.getRestrictedFeatures('under13');
      const under16 = service.getRestrictedFeatures('under16');
      expect(under13.length).toBeGreaterThan(under16.length);
    });
  });

  describe('step-up verification', () => {
    it('should require parental consent for under-13 accessing DMs', () => {
      const result = service.requireStepUpVerification('user-1', 'direct_messages', 'under13');
      expect(result.required).toBe(true);
      expect(result.method).toBe('parental_consent');
    });

    it('should require phone verification for under-16 accessing random chat', () => {
      const result = service.requireStepUpVerification('user-2', 'random_chat', 'under16');
      expect(result.required).toBe(true);
      expect(result.method).toBe('phone');
    });

    it('should require ID upload for under-18 accessing dating', () => {
      const result = service.requireStepUpVerification('user-3', 'dating', 'under18');
      expect(result.required).toBe(true);
      expect(result.method).toBe('id_upload');
    });

    it('should not require step-up for adults', () => {
      const result = service.requireStepUpVerification('user-4', 'dating', 'adult');
      expect(result.required).toBe(false);
    });

    it('should not require step-up for unrestricted features', () => {
      const result = service.requireStepUpVerification('user-5', 'view_feed', 'under18');
      expect(result.required).toBe(false);
    });
  });

  describe('step-up methods by age group', () => {
    it('should only allow parental consent for under-13', () => {
      const methods = service.getStepUpMethods('under13');
      expect(methods).toContain('parental_consent');
      expect(methods).not.toContain('id_upload');
    });

    it('should allow phone and parental consent for under-16', () => {
      const methods = service.getStepUpMethods('under16');
      expect(methods).toContain('parental_consent');
      expect(methods).toContain('phone');
    });

    it('should allow ID upload and phone for under-18', () => {
      const methods = service.getStepUpMethods('under18');
      expect(methods).toContain('id_upload');
      expect(methods).toContain('phone');
    });
  });
});
