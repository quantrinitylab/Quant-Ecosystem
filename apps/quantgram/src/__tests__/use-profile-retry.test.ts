import { describe, expect, it } from 'vitest';
import { shouldRetryProfileFetch } from '../hooks/useProfile';

describe('shouldRetryProfileFetch (guest profile pages must never spin forever)', () => {
  it('never retries PROFILE_NOT_FOUND — the page shows an honest empty state', () => {
    expect(shouldRetryProfileFetch(0, { code: 'PROFILE_NOT_FOUND' })).toBe(false);
  });

  it('never retries UNAUTHORIZED — a 401 is a final answer, not a retry', () => {
    expect(shouldRetryProfileFetch(0, { code: 'UNAUTHORIZED' })).toBe(false);
    expect(shouldRetryProfileFetch(2, { code: 'UNAUTHORIZED' })).toBe(false);
  });

  it('never retries other 4xx client errors', () => {
    expect(shouldRetryProfileFetch(0, { code: 'FORBIDDEN' })).toBe(false);
    expect(shouldRetryProfileFetch(0, { code: 'NOT_FOUND' })).toBe(false);
  });

  it('retries network-level failures (no backend error code) up to 3 times', () => {
    const networkError = new Error('fetch failed');
    expect(shouldRetryProfileFetch(0, networkError)).toBe(true);
    expect(shouldRetryProfileFetch(2, networkError)).toBe(true);
    expect(shouldRetryProfileFetch(3, networkError)).toBe(false);
  });
});
