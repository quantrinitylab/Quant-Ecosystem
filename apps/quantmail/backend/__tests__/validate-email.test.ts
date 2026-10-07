import { describe, it, expect } from 'vitest';
import {
  validateEmailAddress,
  validateEmailAddresses,
  validateComposeEmail,
  sanitizeHtml,
} from '../middleware/validate-email';

describe('Email Validation', () => {
  describe('validateEmailAddress', () => {
    it('accepts valid email addresses', () => {
      expect(validateEmailAddress('user@example.com')).toBe(true);
      expect(validateEmailAddress('user.name@domain.co')).toBe(true);
      expect(validateEmailAddress('user+tag@gmail.com')).toBe(true);
      expect(validateEmailAddress('user@sub.domain.com')).toBe(true);
    });

    it('rejects invalid email addresses', () => {
      expect(validateEmailAddress('')).toBe(false);
      expect(validateEmailAddress('notanemail')).toBe(false);
      expect(validateEmailAddress('@domain.com')).toBe(false);
      expect(validateEmailAddress('user@')).toBe(false);
      expect(validateEmailAddress('user @domain.com')).toBe(false);
    });

    it('rejects emails exceeding 254 characters', () => {
      const longEmail = 'a'.repeat(250) + '@b.co';
      expect(longEmail.length).toBeGreaterThan(254);
      expect(validateEmailAddress(longEmail)).toBe(false);
    });
  });

  describe('validateEmailAddresses', () => {
    it('returns valid when all addresses are valid', () => {
      const result = validateEmailAddresses(['a@b.com', 'c@d.com']);
      expect(result.valid).toBe(true);
      expect(result.invalid).toHaveLength(0);
    });

    it('returns invalid addresses', () => {
      const result = validateEmailAddresses(['a@b.com', 'invalid', 'c@d.com', 'nope']);
      expect(result.valid).toBe(false);
      expect(result.invalid).toEqual(['invalid', 'nope']);
    });
  });

  describe('validateComposeEmail', () => {
    it('passes for valid compose input', () => {
      expect(() =>
        validateComposeEmail({
          toAddresses: ['bob@test.com'],
          subject: 'Hello',
          bodyPlain: 'Hi there',
        }),
      ).not.toThrow();
    });

    it('throws when no recipients provided', () => {
      expect(() =>
        validateComposeEmail({
          toAddresses: [],
          subject: 'Hello',
          bodyPlain: 'Hi',
        }),
      ).toThrow('At least one recipient');
    });

    it('throws when too many recipients', () => {
      const recipients = Array.from({ length: 101 }, (_, i) => `user${i}@test.com`);
      expect(() =>
        validateComposeEmail({
          toAddresses: recipients,
          subject: 'Hello',
          bodyPlain: 'Hi',
        }),
      ).toThrow('Maximum 100 recipients');
    });

    it('throws for invalid email addresses', () => {
      expect(() =>
        validateComposeEmail({
          toAddresses: ['not-valid'],
          subject: 'Hello',
          bodyPlain: 'Hi',
        }),
      ).toThrow('Invalid email address');
    });

    it('throws when subject is empty', () => {
      expect(() =>
        validateComposeEmail({
          toAddresses: ['bob@test.com'],
          subject: '',
          bodyPlain: 'Hi',
        }),
      ).toThrow('Subject is required');
    });

    it('throws when subject exceeds max length', () => {
      expect(() =>
        validateComposeEmail({
          toAddresses: ['bob@test.com'],
          subject: 'x'.repeat(501),
          bodyPlain: 'Hi',
        }),
      ).toThrow('Subject exceeds maximum length');
    });

    it('throws when body is missing', () => {
      expect(() =>
        validateComposeEmail({
          toAddresses: ['bob@test.com'],
          subject: 'Hello',
        }),
      ).toThrow('Email body is required');
    });

    it('throws when too many attachments', () => {
      const attachments = Array.from({ length: 26 }, (_, i) => ({ id: `att-${i}` }));
      expect(() =>
        validateComposeEmail({
          toAddresses: ['bob@test.com'],
          subject: 'Hello',
          bodyPlain: 'Hi',
          attachments,
        }),
      ).toThrow('Maximum 25 attachments');
    });

    it('accepts cc and bcc addresses', () => {
      expect(() =>
        validateComposeEmail({
          toAddresses: ['bob@test.com'],
          ccAddresses: ['cc@test.com'],
          bccAddresses: ['bcc@test.com'],
          subject: 'Hello',
          bodyPlain: 'Hi',
        }),
      ).not.toThrow();
    });
  });

  describe('sanitizeHtml', () => {
    it('removes script tags', () => {
      const html = '<p>Hello</p><script>alert("xss")</script>';
      expect(sanitizeHtml(html)).not.toContain('<script');
    });

    it('removes event handlers', () => {
      const html = '<img src="x" onerror="alert(1)">';
      expect(sanitizeHtml(html)).not.toContain('onerror');
    });

    it('removes javascript: URIs', () => {
      const html = '<a href="javascript:alert(1)">click</a>';
      expect(sanitizeHtml(html)).not.toContain('javascript:');
    });

    it('removes iframe tags', () => {
      const html = '<iframe src="https://evil.com"></iframe>';
      expect(sanitizeHtml(html)).not.toContain('<iframe');
    });

    it('preserves safe HTML', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      expect(sanitizeHtml(html)).toBe(html);
    });
  });
});
