import { describe, expect, it } from 'vitest';
import { InMemoryNavigationRegistry, IntentRouter } from '../src/index';
import type { HandoffIntent } from '../src/index';

function router() {
  const registry = new InMemoryNavigationRegistry();
  registry.register({ routeId: 'inbox', appId: 'quantmail', path: '/mail', actions: ['open'], isDefault: true });
  registry.register({ routeId: 'thread', appId: 'quantmail', path: '/mail/thread/:threadId', actions: ['open', 'view'] });
  registry.register({ routeId: 'compose', appId: 'quantmail', path: '/mail/compose', actions: ['compose'] });
  return new IntentRouter(registry);
}

function intent(overrides: Partial<HandoffIntent> = {}): HandoffIntent {
  return {
    intentId: 'i-1',
    sessionId: 's-1',
    sourceAppId: 'quantchat',
    targetAppId: 'quantmail',
    action: 'view',
    ...overrides,
  };
}

describe('IntentRouter', () => {
  it('resolves an explicit routeId with exact confidence', () => {
    const resolved = router().resolve(intent({ routeId: 'compose', action: 'view' }));
    expect(resolved?.route.routeId).toBe('compose');
    expect(resolved?.confidence).toBe('exact');
    expect(resolved?.params).toEqual({});
  });

  it('returns null for an unknown explicit routeId', () => {
    expect(router().resolve(intent({ routeId: 'nope' }))).toBeNull();
  });

  it('resolves by action when no routeId is given', () => {
    const resolved = router().resolve(intent({ action: 'compose' }));
    expect(resolved?.route.routeId).toBe('compose');
    expect(resolved?.confidence).toBe('action');
    expect(resolved?.reason).toContain('compose');
  });

  it('passes intent params through to the resolution', () => {
    const resolved = router().resolve(intent({ action: 'view', params: { threadId: 't-9' } }));
    expect(resolved?.route.routeId).toBe('thread');
    expect(resolved?.params).toEqual({ threadId: 't-9' });
  });

  it('falls back to the app default with a reason', () => {
    const resolved = router().resolve(intent({ action: 'search' }));
    expect(resolved?.route.routeId).toBe('inbox');
    expect(resolved?.confidence).toBe('default');
    expect(resolved?.reason).toContain('fell back');
  });

  it('returns null when the target app has no routes', () => {
    expect(router().resolve(intent({ targetAppId: 'quantdrive' }))).toBeNull();
  });

  it('rejects malformed intents', () => {
    const r = router();
    expect(() => r.resolve(intent({ targetAppId: '' }))).toThrow('INTENT_TARGET_REQUIRED');
    expect(() => r.resolve(intent({ action: '' }))).toThrow('INTENT_ACTION_REQUIRED');
    expect(() => r.resolve(intent({ intentId: '' }))).toThrow('INTENT_ID_REQUIRED');
  });
});
