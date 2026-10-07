import { describe, it, expect, beforeEach } from 'vitest';
import { CaptchaChallengerService } from './captcha-challenger';

describe('CaptchaChallengerService', () => {
  let service: CaptchaChallengerService;

  beforeEach(() => {
    service = new CaptchaChallengerService(30, 0.7);
  });

  describe('shouldChallenge', () => {
    it('should trigger challenge when low reputation AND suspicious activity', () => {
      const decision = service.shouldChallenge('user1', {
        type: 'login',
        riskScore: 0.9,
        reputationScore: 15,
      });

      expect(decision.shouldChallenge).toBe(true);
      expect(decision.reason).toBeTruthy();
      expect(decision.challengeType).toBeDefined();
      expect(decision.difficulty).toBeDefined();
    });

    it('should trigger challenge when low reputation AND bad IP', () => {
      const decision = service.shouldChallenge('user2', {
        type: 'signup',
        riskScore: 0.3,
        ipReputation: 0.1,
        reputationScore: 20,
      });

      expect(decision.shouldChallenge).toBe(true);
    });

    it('should NOT challenge high reputation user', () => {
      const decision = service.shouldChallenge('goodUser', {
        type: 'login',
        riskScore: 0.9,
        reputationScore: 85,
      });

      expect(decision.shouldChallenge).toBe(false);
    });

    it('should NOT challenge when reputation is low but activity is normal', () => {
      const decision = service.shouldChallenge('user3', {
        type: 'browse',
        riskScore: 0.3,
        ipReputation: 0.8,
        reputationScore: 20,
      });

      expect(decision.shouldChallenge).toBe(false);
    });

    it('should increase difficulty for very high risk', () => {
      const decision = service.shouldChallenge('risky', {
        type: 'login',
        riskScore: 0.95,
        ipReputation: 0.1,
        reputationScore: 10,
      });

      expect(decision.shouldChallenge).toBe(true);
      expect(decision.difficulty).toBe('hard');
      expect(decision.challengeType).toBe('recaptcha');
    });

    it('should use medium difficulty for moderate risk', () => {
      const decision = service.shouldChallenge('moderate', {
        type: 'post',
        riskScore: 0.8,
        reputationScore: 15,
      });

      expect(decision.shouldChallenge).toBe(true);
      expect(decision.difficulty).toBe('medium');
    });
  });

  describe('issueChallenge', () => {
    it('should issue a challenge token with expiry', () => {
      const challenge = service.issueChallenge('user1');

      expect(challenge.token).toBeTruthy();
      expect(challenge.token.length).toBe(32);
      expect(challenge.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('verifyCaptcha', () => {
    it('should verify a valid challenge token', () => {
      const challenge = service.issueChallenge('user1');
      const isValid = service.verifyCaptcha(challenge.token);
      expect(isValid).toBe(true);
    });

    it('should reject an invalid token', () => {
      const isValid = service.verifyCaptcha('invalid-token-12345');
      expect(isValid).toBe(false);
    });
  });

  describe('getChallengePending', () => {
    it('should return pending:false when no challenge exists', () => {
      const status = service.getChallengePending('user1');
      expect(status.pending).toBe(false);
    });

    it('should return pending:true when challenge is issued', () => {
      service.issueChallenge('user1');
      const status = service.getChallengePending('user1');
      expect(status.pending).toBe(true);
      expect(status.issuedAt).toBeDefined();
      expect(status.expiresAt).toBeDefined();
    });

    it('should return pending:false after challenge is verified', () => {
      const challenge = service.issueChallenge('user1');
      service.verifyCaptcha(challenge.token);
      const status = service.getChallengePending('user1');
      expect(status.pending).toBe(false);
    });
  });
});
