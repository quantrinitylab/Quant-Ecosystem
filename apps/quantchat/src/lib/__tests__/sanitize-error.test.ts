// @vitest-environment node
// ============================================================================
// QM-UIUX-088 — sanitize-error regression tests
// ============================================================================
//
// The foreign draft's sanitizer stripped only stacks + file paths and leaked
// URLs / IPs / Bearer tokens / JWTs / API keys verbatim. These tests pin the
// hardened behavior (the apps/quantmail/src/lib/ai-error.ts standard from
// QM-UIUX-036): they FAIL against the draft sanitizer and against the
// original code (no such module / blanket silence), and PASS on the fix.

import { describe, it, expect } from 'vitest';
import { sanitizeErrorMessage, describeAiError } from '../sanitize-error';

const GENERIC = 'The AI service hit a snag. Please try again.';
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3AAA';

describe('sanitizeErrorMessage', () => {
  it('keeps a safe message intact', () => {
    expect(sanitizeErrorMessage(new Error('The model returned an empty response.'))).toBe(
      'The model returned an empty response.',
    );
  });

  it('drops stack traces — only the first line is used', () => {
    const result = sanitizeErrorMessage(
      new Error('Boom while generating\n    at handler (/srv/app/src/ai.ts:10:5)'),
    );
    expect(result).toBe('Boom while generating');
    expect(result).not.toContain('at handler');
  });

  it('strips file paths on the first line', () => {
    const result = sanitizeErrorMessage(new Error('Cannot open /srv/app/src/config.ts'));
    expect(result).not.toContain('config.ts');
    expect(result).not.toContain('/srv/app');
    expect(result).toContain('[file]');
  });

  it('strips URLs instead of leaking where the backend lives', () => {
    const result = sanitizeErrorMessage(
      new Error('POST http://localhost:4000/api/ai/chat failed with 500'),
    );
    expect(result).not.toContain('localhost');
    expect(result).not.toContain('http://');
    expect(result).toContain('[link]');
  });

  it('strips bare IP addresses and ports', () => {
    const result = sanitizeErrorMessage(new Error('connect error at 10.1.2.3:9000 — refused'));
    expect(result).not.toContain('10.1.2.3');
    expect(result).not.toContain('9000');
    expect(result).toContain('[host]');
  });

  it('redacts bearer tokens', () => {
    const result = sanitizeErrorMessage(
      new Error('Upstream rejected credentials: Bearer abcdef1234567890XYZ'),
    );
    expect(result).not.toContain('abcdef1234567890XYZ');
    expect(result).toContain('[redacted]');
  });

  it('redacts JWTs', () => {
    const result = sanitizeErrorMessage(new Error(`bad token ${JWT}`));
    expect(result).not.toContain('eyJ');
    expect(result).toContain('[redacted]');
  });

  it('redacts api keys passed as parameters', () => {
    const result = sanitizeErrorMessage(new Error('request failed api_key=sk-1234567890abcdef'));
    expect(result).not.toContain('sk-1234567890abcdef');
    expect(result).toContain('[redacted]');
  });

  it('redacts standalone key shapes (sk-, ghp_, AKIA)', () => {
    expect(sanitizeErrorMessage(new Error('leaked sk-abcdefgh12345678 here'))).not.toContain(
      'sk-abcdefgh12345678',
    );
    expect(sanitizeErrorMessage(new Error('leaked ghp_abcdefgh12345678 here'))).not.toContain(
      'ghp_abcdefgh12345678',
    );
    expect(sanitizeErrorMessage(new Error('leaked AKIA1234567890ABCDEF here'))).not.toContain(
      'AKIA1234567890ABCDEF',
    );
  });

  it('caps the surfaced message length at 200', () => {
    expect(sanitizeErrorMessage(new Error('x'.repeat(500))).length).toBe(200);
  });

  it('returns empty string when nothing usable can be recovered', () => {
    expect(sanitizeErrorMessage(undefined)).toBe('');
    expect(sanitizeErrorMessage(null)).toBe('');
    expect(sanitizeErrorMessage(42)).toBe('');
    expect(sanitizeErrorMessage(new Error(''))).toBe('');
  });

  it('extracts the message from a plain error-envelope object', () => {
    expect(sanitizeErrorMessage({ code: 'X', message: 'Backend exploded' })).toBe(
      'Backend exploded',
    );
  });

  it('returns empty string when the message was nothing but a stripped URL/host', () => {
    expect(sanitizeErrorMessage(new Error('http://10.1.2.3:9000/x'))).toBe('');
    expect(sanitizeErrorMessage(new Error('10.1.2.3:9000'))).toBe('');
  });

  // Run-37 P2-736-1: bare internal hostnames (no scheme, no IP) leaked
  // through the QM-UIUX-036 standard. They must not survive here.
  it('strips bare internal hostnames without a scheme', () => {
    const dotted = sanitizeErrorMessage(
      new Error('connect failed quantchat-backend.internal:4000 refused'),
    );
    expect(dotted).not.toContain('quantchat-backend.internal');
    expect(dotted).not.toContain('4000');
    expect(dotted).toContain('[host]');
    const service = sanitizeErrorMessage(new Error('upstream ai-service:9000 unreachable'));
    expect(service).not.toContain('ai-service');
    expect(service).not.toContain('9000');
    expect(service).toContain('[host]');
  });

  // Run-37 P2-736-2: credential shapes outside the original enumerated list.
  it('redacts credential shapes beyond the original enumerated list', () => {
    expect(
      sanitizeErrorMessage(new Error('leaked github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz here')),
    ).not.toContain('github_pat_');
    expect(sanitizeErrorMessage(new Error('leaked gho_abcdefgh12345678 here'))).not.toContain(
      'gho_abcdefgh12345678',
    );
    expect(sanitizeErrorMessage(new Error('leaked ghu_abcdefgh12345678 here'))).not.toContain(
      'ghu_abcdefgh12345678',
    );
    expect(
      sanitizeErrorMessage(new Error('slack hook xoxb-1234567890ab-cdef failed')),
    ).not.toContain('xoxb-1234567890ab');
    const basic = sanitizeErrorMessage(
      new Error('proxy rejected Authorization: Basic dXNlcjpwYXNzd29yZA=='),
    );
    expect(basic).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(basic).toContain('[redacted]');
    expect(
      sanitizeErrorMessage(new Error('bad key -----BEGIN RSA PRIVATE KEY----- loaded')),
    ).not.toContain('BEGIN RSA PRIVATE KEY');
  });
});

describe('describeAiError', () => {
  it('never returns an empty string', () => {
    expect(describeAiError(undefined)).toBe(GENERIC);
    expect(describeAiError(new Error('   '))).toBe(GENERIC);
  });

  it('classifies timeouts by message and by envelope code', () => {
    expect(describeAiError(new Error('Request timed out after 30 seconds'))).toBe(
      'The AI request timed out. Check your connection and try again.',
    );
    expect(describeAiError({ code: 'TIMEOUT', message: 'whatever' })).toBe(
      'The AI request timed out. Check your connection and try again.',
    );
  });

  it('classifies network failures', () => {
    expect(describeAiError(new Error('Failed to fetch'))).toBe(
      'The AI service is unreachable. Check your connection and try again.',
    );
  });

  it('classifies rate limits by message and by status code', () => {
    expect(describeAiError(new Error('Rate limit exceeded (429)'))).toBe(
      'The AI service is busy right now (rate limit). Wait a moment and try again.',
    );
    expect(describeAiError({ code: 'X', message: 'slow down', statusCode: 429 })).toBe(
      'The AI service is busy right now (rate limit). Wait a moment and try again.',
    );
  });

  it('classifies auth failures by message, code, and status code', () => {
    expect(describeAiError(new Error('401 Unauthorized'))).toBe(
      'Your session expired. Sign in again and retry.',
    );
    expect(describeAiError({ code: 'AUTH_ERROR', message: 'nope', statusCode: 401 })).toBe(
      'Your session expired. Sign in again and retry.',
    );
  });

  it('reports a caller cancellation as a cancellation, not a network failure', () => {
    expect(describeAiError({ code: 'ABORTED', message: 'Request cancelled' })).toBe(
      'The AI request was cancelled. Please try again.',
    );
  });

  it('surfaces the sanitized server message instead of discarding it', () => {
    expect(describeAiError(new Error('The model returned an empty response.'))).toBe(
      'The AI service hit a snag: The model returned an empty response.',
    );
  });

  it('does not leak secrets through the surfaced message', () => {
    const result = describeAiError(
      new Error(`POST http://10.1.2.3:9000/ai failed, Bearer abcdef1234567890XYZ, token ${JWT}`),
    );
    expect(result).not.toContain('10.1.2.3');
    expect(result).not.toContain('abcdef1234567890XYZ');
    expect(result).not.toContain('eyJ');
  });

  it('falls back to generic when the message was nothing but a stripped URL', () => {
    expect(describeAiError(new Error('http://10.1.2.3:9000/x'))).toBe(GENERIC);
  });
});

// QM-UIUX-094 — zero-defect run-39 (P2-D39-1): the bare host:port rule
// required a hyphen (ai-service:9000) or a dotted internal TLD, so
// single-word and underscore Docker-service names leaked verbatim. These
// tests FAIL against the pre-fix sanitize-error.ts and PASS after it; the
// over-redaction pins pass on both and guard the widened pattern.
describe('sanitizeErrorMessage — single-word service host:port (QM-UIUX-094)', () => {
  it('strips single-word and underscore service names with ports', () => {
    const backend = sanitizeErrorMessage(new Error('upstream backend:9000 unreachable'));
    expect(backend).not.toContain('backend');
    expect(backend).not.toContain('9000');
    expect(backend).toContain('[host]');
    const redis = sanitizeErrorMessage(new Error('cache redis:6379 refused'));
    expect(redis).not.toContain('redis');
    expect(redis).not.toContain('6379');
    expect(redis).toContain('[host]');
    const db = sanitizeErrorMessage(new Error('db replica db:5432 unreachable'));
    expect(db).not.toContain('db:5432');
    expect(db).not.toContain('5432');
    expect(db).toContain('[host]');
    const underscore = sanitizeErrorMessage(new Error('upstream ai_service:9000 unreachable'));
    expect(underscore).not.toContain('ai_service');
    expect(underscore).not.toContain('9000');
    expect(underscore).toContain('[host]');
  });

  it('strips single-word service names with a path', () => {
    const result = sanitizeErrorMessage(new Error('POST backend:9000/api/ai/chat failed'));
    expect(result).not.toContain('backend');
    expect(result).not.toContain('9000');
    expect(result).not.toContain('/api/ai/chat');
    expect(result).toContain('[host]');
  });

  it('returns empty string when the message was nothing but a single-word service host', () => {
    expect(sanitizeErrorMessage(new Error('backend:9000'))).toBe('');
    expect(sanitizeErrorMessage(new Error('ai_service:9000'))).toBe('');
  });

  it('does not over-redact times, ratios, versions, or ports in plain sentences', () => {
    expect(sanitizeErrorMessage(new Error('The model replied at 9:30 in the morning'))).toBe(
      'The model replied at 9:30 in the morning',
    );
    expect(sanitizeErrorMessage(new Error('Aspect ratio 16:9 is not supported'))).toBe(
      'Aspect ratio 16:9 is not supported',
    );
    expect(sanitizeErrorMessage(new Error('Schema v2:3 unsupported'))).toBe(
      'Schema v2:3 unsupported',
    );
    expect(sanitizeErrorMessage(new Error('The server listens on port 8080 locally'))).toBe(
      'The server listens on port 8080 locally',
    );
  });

  it('does not leak single-word service hosts through describeAiError', () => {
    const result = describeAiError(new Error('upstream ai_service:9000 exploded'));
    expect(result).not.toContain('ai_service');
    expect(result).not.toContain('9000');
  });
});
