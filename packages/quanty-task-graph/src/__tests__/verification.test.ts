import { describe, expect, it } from 'vitest';
import { makeCapability } from './fixtures';
import { mayRetry, resolveUnknownOutcome } from '../verification';
import type { VerificationAdapter } from '../types';

function adapterFor(verdict: 'verified' | 'absent' | 'unknown'): VerificationAdapter {
  return { verify: async () => verdict };
}

describe('resolveUnknownOutcome', () => {
  const capability = makeCapability({ capabilityId: 'quantmail.email.send' });

  it('verified -> no retry, mutation treated as completed', async () => {
    const result = await resolveUnknownOutcome(
      capability,
      'key-1',
      adapterFor('verified'),
      new AbortController().signal,
    );
    expect(result.outcome).toBe('verified');
    expect(result.detail).toMatch(/no retry/);
  });

  it('absent -> safe to retry with the same key', async () => {
    const result = await resolveUnknownOutcome(
      capability,
      'key-1',
      adapterFor('absent'),
      new AbortController().signal,
    );
    expect(result.outcome).toBe('absent');
    expect(result.detail).toMatch(/same idempotency key/);
  });

  it('unknown -> stays unknown, no blind retry', async () => {
    const result = await resolveUnknownOutcome(
      capability,
      'key-1',
      adapterFor('unknown'),
      new AbortController().signal,
    );
    expect(result.outcome).toBe('still_unknown');
  });

  it('adapter throwing -> still_unknown (fail closed)', async () => {
    const throwing: VerificationAdapter = {
      verify: async () => {
        throw new Error('db unreachable');
      },
    };
    const result = await resolveUnknownOutcome(
      capability,
      'key-1',
      throwing,
      new AbortController().signal,
    );
    expect(result.outcome).toBe('still_unknown');
    expect(result.detail).toMatch(/db unreachable/);
  });
});

describe('mayRetry', () => {
  it('allows retries within budget', () => {
    expect(
      mayRetry({ attempt: 1, maxRetries: 1, idempotencyRequired: true, idempotencyKeyPresent: true }).allowed,
    ).toBe(true);
  });

  it('denies retries beyond budget', () => {
    expect(
      mayRetry({ attempt: 2, maxRetries: 1, idempotencyRequired: true, idempotencyKeyPresent: true }).allowed,
    ).toBe(false);
  });

  it('denies mutating retries without an idempotency key', () => {
    const result = mayRetry({
      attempt: 1,
      maxRetries: 3,
      idempotencyRequired: true,
      idempotencyKeyPresent: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/idempotency key/);
  });

  it('allows non-mutating retries without a key', () => {
    expect(
      mayRetry({ attempt: 1, maxRetries: 3, idempotencyRequired: false, idempotencyKeyPresent: false }).allowed,
    ).toBe(true);
  });
});
