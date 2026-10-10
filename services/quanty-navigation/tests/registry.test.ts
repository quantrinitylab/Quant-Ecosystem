import { describe, expect, it } from 'vitest';
import { InMemoryNavigationRegistry } from '../src/index';

function seeded() {
  const registry = new InMemoryNavigationRegistry();
  registry.register({
    routeId: 'mail.inbox',
    appId: 'quantmail',
    path: '/mail',
    title: 'Inbox',
    actions: ['open'],
    isDefault: true,
  });
  registry.register({
    routeId: 'mail.thread',
    appId: 'quantmail',
    path: '/mail/thread/:threadId',
    title: 'Thread',
    actions: ['open', 'view'],
  });
  registry.register({
    routeId: 'mail.compose',
    appId: 'quantmail',
    path: '/mail/compose',
    actions: ['compose', 'create'],
  });
  registry.register({
    routeId: 'chat.thread',
    appId: 'quantchat',
    path: '/chat/:peerId',
    actions: ['open'],
    isDefault: true,
  });
  return registry;
}

describe('InMemoryNavigationRegistry', () => {
  it('registers and retrieves routes per app', () => {
    const registry = seeded();
    expect(registry.get('quantmail', 'mail.thread')?.path).toBe('/mail/thread/:threadId');
    expect(registry.get('quantmail', 'nope')).toBeUndefined();
    expect(registry.list('quantmail').map((r) => r.routeId)).toEqual(['mail.inbox', 'mail.thread', 'mail.compose']);
    expect(registry.list('unknown')).toEqual([]);
    expect(registry.apps().sort()).toEqual(['quantchat', 'quantmail']);
  });

  it('rejects duplicates, second defaults, and bad routes', () => {
    const registry = seeded();
    expect(() =>
      registry.register({ routeId: 'mail.thread', appId: 'quantmail', path: '/other' }),
    ).toThrow('ROUTE_ALREADY_REGISTERED:quantmail/mail.thread');
    expect(() =>
      registry.register({ routeId: 'mail.other', appId: 'quantmail', path: '/other', isDefault: true }),
    ).toThrow('DEFAULT_ROUTE_ALREADY_REGISTERED:quantmail');
    expect(() => registry.register({ routeId: '', appId: 'quantmail', path: '/x' })).toThrow('ROUTE_ID_REQUIRED');
    expect(() => registry.register({ routeId: 'r', appId: 'quantmail', path: 'no-slash' })).toThrow(
      'ROUTE_PATH_MUST_START_WITH_SLASH',
    );
    expect(registry.defaultRoute('quantmail')?.routeId).toBe('mail.inbox');
    expect(registry.defaultRoute('unknown')).toBeUndefined();
  });

  it('matches concrete paths and extracts parameters', () => {
    const registry = seeded();
    const match = registry.matchPath('quantmail', '/mail/thread/t-123');
    expect(match?.route.routeId).toBe('mail.thread');
    expect(match?.params).toEqual({ threadId: 't-123' });
    expect(registry.matchPath('quantmail', '/mail/thread/t-123/')?.route.routeId).toBe('mail.thread');
    expect(registry.matchPath('quantmail', '/mail/thread/t-123/')?.params).toEqual({ threadId: 't-123' });
    expect(registry.matchPath('quantmail', '/mail/thread/')).toBeUndefined();
    expect(registry.matchPath('quantmail', '/drive')).toBeUndefined();
    expect(registry.matchPath('nope', '/mail')).toBeUndefined();
  });

  it('returns copies so callers cannot corrupt the registry', () => {
    const registry = seeded();
    const route = registry.get('quantmail', 'mail.thread');
    route!.path = '/hacked';
    expect(registry.get('quantmail', 'mail.thread')?.path).toBe('/mail/thread/:threadId');
  });
});
