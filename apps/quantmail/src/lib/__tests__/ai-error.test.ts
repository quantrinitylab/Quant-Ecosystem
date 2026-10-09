import { describe, it, expect } from 'vitest';
import { sanitizeAiError } from '../ai-error';

const GENERIC = 'The AI service hit a snag. Please try again.';

describe('sanitizeAiError', () => {
  it('surfaces a safe error message instead of a generic one', () => {
    expect(sanitizeAiError(new Error('The model returned an empty response.'))).toBe(
      'The AI service hit a snag: The model returned an empty response.',
    );
  });

  it('drops stack traces — only the first line is used', () => {
    const error = new Error(
      'Boom while generating\n    at handler (/srv/app/src/ai.ts:10:5)\n    at process (node:internal:1:1)',
    );
    const result = sanitizeAiError(error);
    expect(result).toBe('The AI service hit a snag: Boom while generating');
    expect(result).not.toContain('ai.ts');
    expect(result).not.toContain('at handler');
  });

  it('strips file paths that appear on the first line', () => {
    const result = sanitizeAiError(new Error('Cannot open /srv/app/src/config.ts for reading'));
    expect(result).not.toContain('config.ts');
    expect(result).not.toContain('/srv/app');
    expect(result).toContain('[file]');
  });

  it('strips internal URLs instead of leaking where the backend lives', () => {
    const result = sanitizeAiError(
      new Error('POST http://localhost:4000/api/ai/chat failed with 500'),
    );
    expect(result).not.toContain('localhost');
    expect(result).not.toContain('http://');
    expect(result).toContain('[link]');
  });

  it('strips internal IP addresses and ports', () => {
    const result = sanitizeAiError(
      new Error('connect error at http://10.1.2.3:9000/ai/v1 — refused'),
    );
    expect(result).not.toContain('10.1.2.3');
    expect(result).not.toContain('9000');
  });

  it('redacts bearer tokens', () => {
    const result = sanitizeAiError(
      new Error('Upstream rejected credentials: Bearer abcdef1234567890XYZ'),
    );
    expect(result).not.toContain('abcdef1234567890XYZ');
    expect(result).toContain('[redacted]');
  });

  it('redacts JWTs', () => {
    const result = sanitizeAiError(
      new Error(
        'bad token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3AAA',
      ),
    );
    expect(result).not.toContain('eyJ');
    expect(result).toContain('[redacted]');
  });

  it('redacts api keys passed as parameters', () => {
    const result = sanitizeAiError(new Error('request failed api_key=sk-1234567890abcdef'));
    expect(result).not.toContain('sk-1234567890abcdef');
    expect(result).toContain('[redacted]');
  });

  it('falls back to the generic message when nothing meaningful remains after stripping', () => {
    expect(sanitizeAiError(new Error('http://10.1.2.3:9000/x'))).toBe(GENERIC);
  });

  it('falls back to the generic message for empty or non-Error values', () => {
    expect(sanitizeAiError(new Error('   '))).toBe(GENERIC);
    expect(sanitizeAiError('boom')).toBe(GENERIC);
    expect(sanitizeAiError(undefined)).toBe(GENERIC);
    expect(sanitizeAiError({ message: 'not an Error instance' })).toBe(GENERIC);
  });

  it('keeps the honest failure-class messages', () => {
    expect(sanitizeAiError(new Error('Request timed out after 30 seconds'))).toBe(
      'The AI request timed out. Check your connection and try again.',
    );
    expect(sanitizeAiError(new Error('Failed to fetch'))).toBe(
      'The AI service is unreachable. Check your connection and try again.',
    );
    expect(sanitizeAiError(new Error('Rate limit exceeded (429)'))).toBe(
      'The AI service is busy right now (rate limit). Wait a moment and try again.',
    );
    expect(sanitizeAiError(new Error('401 Unauthorized'))).toBe(
      'Your session expired. Sign in again and retry.',
    );
  });

  it('caps the surfaced message length', () => {
    const result = sanitizeAiError(new Error('x'.repeat(500)));
    expect(result.length).toBeLessThanOrEqual('The AI service hit a snag: '.length + 200);
  });
});
