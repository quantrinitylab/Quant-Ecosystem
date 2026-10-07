import { describe, it, expect } from 'vitest';
import { PIIScrubber } from '../pii-scrubber.js';

describe('PIIScrubber', () => {
  it('scrubs email addresses from strings', () => {
    const scrubber = new PIIScrubber();
    const result = scrubber.scrub('Contact user@example.com for info');

    expect(result).toBe('Contact [REDACTED_EMAIL] for info');
  });

  it('scrubs phone numbers', () => {
    const scrubber = new PIIScrubber();
    const result = scrubber.scrub('Call 555-123-4567 for support');

    expect(result).toBe('Call [REDACTED_PHONE] for support');
  });

  it('scrubs SSN', () => {
    const scrubber = new PIIScrubber();
    const result = scrubber.scrub('SSN: 123-45-6789');

    expect(result).toBe('SSN: [REDACTED_SSN]');
  });

  it('scrubs credit card numbers', () => {
    const scrubber = new PIIScrubber();
    const result = scrubber.scrub('Card: 4111-1111-1111-1111');

    expect(result).toBe('Card: [REDACTED_CC]');
  });

  it('scrubs IP addresses', () => {
    const scrubber = new PIIScrubber();
    const result = scrubber.scrub('Request from 192.168.1.100');

    expect(result).toBe('Request from [REDACTED_IP]');
  });

  it('scrubs JWT tokens', () => {
    const scrubber = new PIIScrubber();
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123_signature';
    const result = scrubber.scrub(`Token: ${jwt}`);

    expect(result).toBe('Token: [REDACTED_JWT]');
  });

  it('scrubs multiple PII types in one string', () => {
    const scrubber = new PIIScrubber();
    const result = scrubber.scrub('User user@test.com from 10.0.0.1 called 555-111-2222');

    expect(result).toContain('[REDACTED_EMAIL]');
    expect(result).toContain('[REDACTED_IP]');
    expect(result).toContain('[REDACTED_PHONE]');
    expect(result).not.toContain('user@test.com');
  });

  it('scrubs PII from objects recursively', () => {
    const scrubber = new PIIScrubber();
    const result = scrubber.scrub({
      message: 'Login from user@test.com',
      nested: {
        ip: 'Source: 192.168.0.1',
      },
    });

    expect(result).toEqual({
      message: 'Login from [REDACTED_EMAIL]',
      nested: {
        ip: 'Source: [REDACTED_IP]',
      },
    });
  });

  it('scrubs PII from arrays in objects', () => {
    const scrubber = new PIIScrubber();
    const result = scrubber.scrub({
      entries: ['user@a.com logged in', 'admin@b.com logged out'],
    });

    const entries = (result as Record<string, unknown>)['entries'] as string[];
    expect(entries[0]).toContain('[REDACTED_EMAIL]');
    expect(entries[1]).toContain('[REDACTED_EMAIL]');
  });

  it('supports custom patterns', () => {
    const scrubber = new PIIScrubber();
    scrubber.addPattern('api_key', /sk_[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]');

    const result = scrubber.scrub('Key: sk_abcdefghijklmnopqrstu');
    expect(result).toBe('Key: [REDACTED_API_KEY]');
  });

  it('tracks redaction stats', () => {
    const scrubber = new PIIScrubber();
    scrubber.scrub('user@a.com and admin@b.com');
    scrubber.scrub('IP: 10.0.0.1');

    const stats = scrubber.getRedactionStats();
    expect(stats['email']).toBe(2);
    expect(stats['ip_address']).toBe(1);
  });

  it('resets stats', () => {
    const scrubber = new PIIScrubber();
    scrubber.scrub('user@a.com');
    scrubber.resetStats();

    const stats = scrubber.getRedactionStats();
    expect(stats['email']).toBe(0);
  });

  it('returns pattern names', () => {
    const scrubber = new PIIScrubber();
    const names = scrubber.getPatternNames();

    expect(names).toContain('email');
    expect(names).toContain('phone');
    expect(names).toContain('ssn');
    expect(names).toContain('credit_card');
    expect(names).toContain('ip_address');
    expect(names).toContain('jwt');
  });

  it('handles overlapping PII patterns without interference', () => {
    const scrubber = new PIIScrubber();
    // IP address should not be partially consumed by phone pattern
    const result = scrubber.scrub('Server at 192.168.1.100 received call from 555-123-4567');

    expect(result).toContain('[REDACTED_IP]');
    expect(result).toContain('[REDACTED_PHONE]');
    expect(result).not.toContain('192.168.1.100');
    expect(result).not.toContain('555-123-4567');
  });

  it('scrubs IP adjacent to other numeric data correctly', () => {
    const scrubber = new PIIScrubber();
    const result = scrubber.scrub('From 10.0.0.1 port 8080 user user@test.com');

    expect(result).toContain('[REDACTED_IP]');
    expect(result).toContain('[REDACTED_EMAIL]');
    expect(result).not.toContain('10.0.0.1');
    expect(result).not.toContain('user@test.com');
  });
});
