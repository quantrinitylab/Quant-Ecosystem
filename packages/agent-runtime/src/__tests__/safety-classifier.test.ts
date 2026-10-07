import { describe, it, expect } from 'vitest';
import { SafetyClassifier } from '../safety-classifier.js';
import { SafetyLevel } from '../types.js';

describe('SafetyClassifier', () => {
  describe('classify', () => {
    it('returns Safe for safe actions', () => {
      const classifier = new SafetyClassifier();
      const result = classifier.classify('readEmails', {});
      expect(result.level).toBe(SafetyLevel.Safe);
      expect(result.rules_triggered).toHaveLength(0);
    });

    it('returns Blocked for PII access without consent', () => {
      const classifier = new SafetyClassifier();
      const result = classifier.classify('readUserData', {
        piiAccess: true,
        consent: false,
      });
      expect(result.level).toBe(SafetyLevel.Blocked);
      expect(result.rules_triggered).toContain('PII_WITHOUT_CONSENT');
    });

    it('returns Caution for high-value financial actions', () => {
      const classifier = new SafetyClassifier();
      const result = classifier.classify('payment_process', { amount: 5000 });
      expect(result.level).toBe(SafetyLevel.Caution);
      expect(result.rules_triggered).toContain('FINANCIAL_HIGH_VALUE');
    });

    it('does not trigger financial rule for low amounts', () => {
      const classifier = new SafetyClassifier();
      const result = classifier.classify('payment_process', { amount: 50 });
      expect(result.level).toBe(SafetyLevel.Safe);
    });

    it('returns Caution for admin actions', () => {
      const classifier = new SafetyClassifier();
      const result = classifier.classify('delete_account', {});
      expect(result.level).toBe(SafetyLevel.Caution);
      expect(result.rules_triggered).toContain('ADMIN_ACTION');
    });

    it('returns Caution for change_role actions', () => {
      const classifier = new SafetyClassifier();
      const result = classifier.classify('change_role', {});
      expect(result.level).toBe(SafetyLevel.Caution);
      expect(result.rules_triggered).toContain('ADMIN_ACTION');
    });

    it('returns Blocked for moderation override', () => {
      const classifier = new SafetyClassifier();
      const result = classifier.classify('override_moderation', {});
      expect(result.level).toBe(SafetyLevel.Blocked);
      expect(result.rules_triggered).toContain('MODERATION_OVERRIDE');
    });

    it('returns Caution for bulk actions', () => {
      const classifier = new SafetyClassifier();
      const result = classifier.classify('updateRecords', { affectedCount: 500 });
      expect(result.level).toBe(SafetyLevel.Caution);
      expect(result.rules_triggered).toContain('BULK_ACTION');
    });

    it('returns highest severity when multiple rules trigger', () => {
      const classifier = new SafetyClassifier();
      // Both PII (blocked) and bulk action (caution) trigger
      const result = classifier.classify('readUserData', {
        piiAccess: true,
        consent: false,
        affectedCount: 200,
      });
      expect(result.level).toBe(SafetyLevel.Blocked);
      expect(result.rules_triggered).toContain('PII_WITHOUT_CONSENT');
      expect(result.rules_triggered).toContain('BULK_ACTION');
    });
  });

  describe('addRule', () => {
    it('adds a custom rule', () => {
      const classifier = new SafetyClassifier();
      classifier.addRule({
        id: 'CUSTOM_RULE',
        description: 'Custom test rule',
        check: (action) => action === 'customAction',
        level: SafetyLevel.Caution,
      });
      const result = classifier.classify('customAction', {});
      expect(result.rules_triggered).toContain('CUSTOM_RULE');
    });
  });

  describe('removeRule', () => {
    it('removes a rule by ID', () => {
      const classifier = new SafetyClassifier();
      classifier.removeRule('PII_WITHOUT_CONSENT');
      const result = classifier.classify('readUserData', {
        piiAccess: true,
        consent: false,
      });
      expect(result.level).toBe(SafetyLevel.Safe);
      expect(result.rules_triggered).not.toContain('PII_WITHOUT_CONSENT');
    });
  });

  describe('getRules', () => {
    it('returns all rules', () => {
      const classifier = new SafetyClassifier();
      const rules = classifier.getRules();
      expect(rules.length).toBeGreaterThanOrEqual(5);
      expect(rules.map((r) => r.id)).toContain('PII_WITHOUT_CONSENT');
      expect(rules.map((r) => r.id)).toContain('FINANCIAL_HIGH_VALUE');
    });
  });
});
