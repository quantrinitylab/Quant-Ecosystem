import { describe, expect, it } from 'vitest';
import {
  buildDeepLink,
  createHandoff,
  validateHandoff,
  InMemoryNavigationRegistry,
  IntentRouter,
} from '../src/index';
import type { QuantyRoute } from '../src/index';

const threadRoute: QuantyRoute = {
  routeId: 'thread',
  appId: 'quantmail',
  path: '/mail/thread/:threadId',
  actions: ['view'],
};

function resolvedHandoff(nowMs: number) {
  const registry = new InMemoryNavigationRegistry();
  registry.register({ ...threadRoute });
  registry.register({ routeId: 'inbox', appId: 'quantmail', path: '/mail', isDefault: true });
  const router = new IntentRouter(registry);
  const resolved = router.resolve({
    intentId: 'i-1',
    sessionId: 's-1',
    sourceAppId: 'quantchat',
    targetAppId: 'quantmail',
    action: 'view',
    params: { threadId: 't-42' },
    resourceRefs: ['mail:t-42'],
    contextScope: ['mail.read'],
  });
  if (!resolved) throw new Error('setup failed');
  return createHandoff(
    {
      intentId: 'i-1',
      sessionId: 's-1',
      sourceAppId: 'quantchat',
      targetAppId: 'quantmail',
      action: 'view',
      params: { threadId: 't-42' },
      resourceRefs: ['mail:t-42'],
      contextScope: ['mail.read'],
    },
    resolved,
    { handoffId: 'h-1', nowMs },
  );
}

describe('handoff payloads', () => {
  it('builds a deep link with substituted, encoded parameters', () => {
    expect(buildDeepLink(threadRoute, { threadId: 't-42' })).toBe('/mail/thread/t-42');
    expect(buildDeepLink(threadRoute, { threadId: 'a b' })).toBe('/mail/thread/a%20b');
    expect(() => buildDeepLink(threadRoute, {})).toThrow('HANDOFF_MISSING_PARAMS:threadId');
  });

  it('creates a complete, expiring handoff payload', () => {
    const nowMs = Date.parse('2026-10-10T12:00:00.000Z');
    const handoff = resolvedHandoff(nowMs);
    expect(handoff.handoffId).toBe('h-1');
    expect(handoff.deepLink).toBe('/mail/thread/t-42');
    expect(handoff.issuedAt).toBe('2026-10-10T12:00:00.000Z');
    expect(handoff.expiresAt).toBe('2026-10-10T12:05:00.000Z');
    expect(handoff.resourceRefs).toEqual(['mail:t-42']);
    expect(handoff.contextScope).toEqual(['mail.read']);
    expect(validateHandoff(handoff, nowMs)).toEqual({ valid: true });
  });

  it('rejects expired handoffs', () => {
    const nowMs = Date.parse('2026-10-10T12:00:00.000Z');
    const handoff = resolvedHandoff(nowMs);
    expect(validateHandoff(handoff, nowMs + 5 * 60 * 1000 + 1)).toEqual({
      valid: false,
      reason: 'handoff expired',
    });
  });

  it('rejects malformed handoffs with reasons', () => {
    const nowMs = Date.parse('2026-10-10T12:00:00.000Z');
    const handoff = resolvedHandoff(nowMs);
    expect(validateHandoff({ ...handoff, handoffId: '' }, nowMs).valid).toBe(false);
    expect(validateHandoff({ ...handoff, deepLink: '/mail/thread/:threadId' }, nowMs)).toEqual({
      valid: false,
      reason: 'deepLink has unsubstituted parameters',
    });
    expect(validateHandoff({ ...handoff, expiresAt: 'not-a-date' }, nowMs).valid).toBe(false);
  });

  it('rejects non-positive TTLs at creation', () => {
    const nowMs = Date.parse('2026-10-10T12:00:00.000Z');
    const registry = new InMemoryNavigationRegistry();
    registry.register({ ...threadRoute });
    const resolved = new IntentRouter(registry).resolve({
      intentId: 'i-1',
      sessionId: 's-1',
      sourceAppId: 'q',
      targetAppId: 'quantmail',
      action: 'view',
      params: { threadId: 't-1' },
    });
    if (!resolved) throw new Error('setup failed');
    expect(() =>
      createHandoff(
        { intentId: 'i-1', sessionId: 's-1', sourceAppId: 'q', targetAppId: 'quantmail', action: 'view' },
        resolved,
        { ttlMs: 0, nowMs },
      ),
    ).toThrow('HANDOFF_TTL_MUST_BE_POSITIVE');
  });
});
