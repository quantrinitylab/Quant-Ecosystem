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

// QM-UIUX-090 — the two residual gaps the zero-defect run-37 audit filed
// against the QM-UIUX-036 pipeline above (P2-736-1/-2), closed in QuantChat's
// sanitize-error.ts by PR #751 and ported back here: bare internal hostnames
// with no scheme/IP, and credential shapes outside the original enumerated
// list. These tests FAIL against the pre-port ai-error.ts and PASS after it.
describe('sanitizeAiError — residual gaps (QM-UIUX-090)', () => {
  it('strips bare internal hostnames without a scheme', () => {
    const dotted = sanitizeAiError(
      new Error('connect failed quantmail-backend.internal:4000 refused'),
    );
    expect(dotted).not.toContain('quantmail-backend.internal');
    expect(dotted).not.toContain('4000');
    expect(dotted).toContain('[host]');
    const service = sanitizeAiError(new Error('upstream ai-service:9000 unreachable'));
    expect(service).not.toContain('ai-service');
    expect(service).not.toContain('9000');
    expect(service).toContain('[host]');
  });

  it('strips bare internal hostnames with a path and other internal TLDs', () => {
    const withPath = sanitizeAiError(
      new Error('POST quantmail-backend.internal:4000/api/ai/chat failed'),
    );
    expect(withPath).not.toContain('quantmail-backend.internal');
    expect(withPath).not.toContain('4000');
    expect(withPath).toContain('[host]');
    const corp = sanitizeAiError(new Error('db replica db.corp:5432 unreachable'));
    expect(corp).not.toContain('db.corp');
    expect(corp).not.toContain('5432');
    expect(corp).toContain('[host]');
  });

  it('falls back to the generic message when the message was only a bare internal host', () => {
    expect(sanitizeAiError(new Error('quantmail-backend.internal:4000'))).toBe(GENERIC);
    expect(sanitizeAiError(new Error('ai-service:9000'))).toBe(GENERIC);
  });

  it('redacts credential shapes beyond the original enumerated list', () => {
    expect(
      sanitizeAiError(new Error('leaked github_pat_11ABCDEFG0aBcDeFgHiJkL here')),
    ).not.toContain('github_pat_');
    expect(
      sanitizeAiError(new Error('leaked github_pat_11ABCDEFG0aBcDeFgHiJkL here')),
    ).not.toContain('11ABCDEFG0aBcDeFgHiJkL');
    expect(sanitizeAiError(new Error('leaked gho_aBcDeFgHiJkLmNoPqRsTuVwXyZ here'))).not.toContain(
      'gho_aBcDeFgHiJkLmNoPqRsTuVwXyZ',
    );
    expect(sanitizeAiError(new Error('leaked ghu_aBcDeFgHiJkLmNoPqRsTuVwXyZ here'))).not.toContain(
      'ghu_aBcDeFgHiJkLmNoPqRsTuVwXyZ',
    );
    expect(
      sanitizeAiError(new Error('slack hook xoxb-123456789012-abcdefghijkl failed')),
    ).not.toContain('xoxb-123456789012-abcdefghijkl');
    const basic = sanitizeAiError(
      new Error('proxy rejected Authorization: Basic dXNlcjpwYXNzd29yZA=='),
    );
    expect(basic).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(basic).toContain('[redacted]');
    expect(
      sanitizeAiError(new Error('bad key -----BEGIN RSA PRIVATE KEY----- loaded')),
    ).not.toContain('BEGIN RSA PRIVATE KEY');
  });
});

// QM-UIUX-094 — zero-defect run-39 (P2-D39-1): the QM-UIUX-090 bare
// host:port rule required a hyphen (ai-service:9000) or a dotted internal
// TLD, so single-word and underscore Docker-service names leaked verbatim
// (W1 node-executed proof in the run-39 shift notes). These tests FAIL
// against the pre-fix ai-error.ts and PASS after it; the over-redaction
// pins pass on both and guard the widened pattern.
describe('sanitizeAiError — single-word service host:port (QM-UIUX-094)', () => {
  it('strips single-word and underscore service names with ports', () => {
    const backend = sanitizeAiError(new Error('upstream backend:9000 unreachable'));
    expect(backend).not.toContain('backend');
    expect(backend).not.toContain('9000');
    expect(backend).toContain('[host]');
    const redis = sanitizeAiError(new Error('cache redis:6379 refused'));
    expect(redis).not.toContain('redis');
    expect(redis).not.toContain('6379');
    expect(redis).toContain('[host]');
    const db = sanitizeAiError(new Error('db replica db:5432 unreachable'));
    expect(db).not.toContain('db:5432');
    expect(db).not.toContain('5432');
    expect(db).toContain('[host]');
    const underscore = sanitizeAiError(new Error('upstream ai_service:9000 unreachable'));
    expect(underscore).not.toContain('ai_service');
    expect(underscore).not.toContain('9000');
    expect(underscore).toContain('[host]');
  });

  it('strips single-word service names with a path', () => {
    const result = sanitizeAiError(new Error('POST backend:9000/api/ai/chat failed'));
    expect(result).not.toContain('backend');
    expect(result).not.toContain('9000');
    expect(result).not.toContain('/api/ai/chat');
    expect(result).toContain('[host]');
  });

  it('falls back to the generic message when the message was only a single-word service host', () => {
    expect(sanitizeAiError(new Error('backend:9000'))).toBe(GENERIC);
    expect(sanitizeAiError(new Error('ai_service:9000'))).toBe(GENERIC);
  });

  it('does not over-redact times, ratios, versions, or ports in plain sentences', () => {
    expect(sanitizeAiError(new Error('The model replied at 9:30 in the morning'))).toBe(
      'The AI service hit a snag: The model replied at 9:30 in the morning',
    );
    expect(sanitizeAiError(new Error('Aspect ratio 16:9 is not supported'))).toBe(
      'The AI service hit a snag: Aspect ratio 16:9 is not supported',
    );
    expect(sanitizeAiError(new Error('Schema v2:3 unsupported'))).toBe(
      'The AI service hit a snag: Schema v2:3 unsupported',
    );
    expect(sanitizeAiError(new Error('The server listens on port 8080 locally'))).toBe(
      'The AI service hit a snag: The server listens on port 8080 locally',
    );
  });
});
