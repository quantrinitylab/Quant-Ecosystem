import { describe, expect, it } from 'vitest';
import { assertContextEnvelope, assertResourceRef, isResourceTypeForApp } from '../index';

describe('ecosystem contracts', () => {
  const ref = {
    appId: 'quantmail' as const,
    resourceType: 'mail.thread',
    resourceId: 'thread-123',
    visibility: 'private' as const,
    canonicalUrl: '/mail/thread/thread-123',
    deepLink: 'quant://mail/thread/thread-123',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('accepts a registered resource reference', () => {
    expect(() => assertResourceRef(ref)).not.toThrow();
  });

  it('rejects a resource type owned by another app', () => {
    expect(isResourceTypeForApp('quantmail', 'tube.video')).toBe(false);
    expect(() => assertResourceRef({ ...ref, resourceType: 'tube.video' })).toThrow(/not registered/);
  });

  it('rejects invalid versions', () => {
    expect(() => assertResourceRef({ ...ref, resourceVersion: 0 })).toThrow(/positive integer/);
  });

  it('validates a context envelope and optional resource', () => {
    expect(() =>
      assertContextEnvelope({
        eventId: 'evt-1',
        schemaVersion: 1,
        correlationId: 'corr-1',
        actor: { type: 'user', userId: 'user-1' },
        sourceApp: 'quantmail',
        targetApp: 'quantchat',
        resource: ref,
        occurredAt: new Date().toISOString(),
        purpose: 'user_action',
        payload: { action: 'share' },
      }),
    ).not.toThrow();
  });
});
