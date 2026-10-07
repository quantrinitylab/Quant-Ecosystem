import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { PreferenceService, NotificationFanout, CrossAppDispatcher } from '@quant/notifications';

import notificationsPlugin from '../notifications';
import { createApp } from '../../app';
import type { AppConfig } from '../../types';

const testConfig: AppConfig = {
  port: 3000,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 1000,
  rateLimitWindow: '1 minute',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

/**
 * Minimal stand-in for the `prisma` plugin so the notifications plugin's
 * `dependencies: ['prisma']` constraint is satisfied WITHOUT pulling in the
 * real `@quant/database` client. fastify-plugin only checks that a plugin with
 * the declared name was loaded.
 */
const fakePrisma = fp(async () => {}, { name: 'prisma' });

function bareApp(): FastifyInstance {
  return Fastify({ logger: false });
}

function spyHooks(app: FastifyInstance) {
  return vi.spyOn(app, 'addHook');
}

function hookNames(spy: ReturnType<typeof spyHooks>): string[] {
  return spy.mock.calls.map((c) => c[0] as string);
}

// ---------------------------------------------------------------------------
// Unit tests (Requirement 8.1): the plugin decorates the instance with a
// usable service and registers `onClose`.
// ---------------------------------------------------------------------------
describe('notifications plugin (decoration + onClose)', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('decorates the instance with the engine services (PreferenceService + NotificationFanout + CrossAppDispatcher)', async () => {
    app = bareApp();
    await app.register(fakePrisma);
    await app.register(notificationsPlugin);
    await app.ready();

    expect(app.hasDecorator('notifications')).toBe(true);
    expect(app.notifications.preferences).toBeInstanceOf(PreferenceService);
    expect(app.notifications.fanout).toBeInstanceOf(NotificationFanout);
    expect(app.notifications.dispatcher).toBeInstanceOf(CrossAppDispatcher);
  });

  it('decorates a USABLE notifications service (preferences, fanout, dispatch all work)', async () => {
    app = bareApp();
    await app.register(fakePrisma);
    await app.register(notificationsPlugin);
    await app.ready();

    // preferences: a new user gets enabled defaults
    const prefs = app.notifications.preferences.getPreferences('user-1');
    expect(prefs.globalEnabled).toBe(true);

    // fanout: routes an event to a recipient (in_app available by default)
    const fanned = app.notifications.fanout.fanout({
      type: 'message',
      sourceApp: 'quantmail',
      title: 'Hi',
      body: 'there',
      recipientIds: ['user-1'],
      priority: 'normal',
    });
    expect(fanned.totalRecipients).toBe(1);
    expect(fanned.routedCount).toBe(1);

    // dispatcher: cross-app dispatch returns a fanout result
    const dispatched = app.notifications.dispatcher.dispatch({
      type: 'message',
      title: 'New message',
      body: 'preview',
      recipientIds: ['user-1', 'user-2'],
    });
    expect(dispatched.sourceApp).toBe('server-core');
    expect(dispatched.totalRecipients).toBe(2);
  });

  it('registers an onClose hook and closes cleanly', async () => {
    app = bareApp();
    const spy = spyHooks(app);
    await app.register(fakePrisma);
    await app.register(notificationsPlugin);
    await app.ready();

    expect(hookNames(spy)).toContain('onClose');

    // onClose must run without throwing (in-memory services → safe no-op)
    await expect(app.close()).resolves.toBeUndefined();
  });

  it('fails fast when its `prisma` dependency is missing (enforces ordering)', async () => {
    app = bareApp();
    // fastify-plugin surfaces the unmet dependency during boot (at register or
    // ready, depending on avvio scheduling) — capture it wherever it throws.
    let err: unknown;
    try {
      await app.register(notificationsPlugin);
      await app.ready();
    } catch (e) {
      err = e;
    }
    expect(String((err as Error | undefined)?.message)).toMatch(/dependency 'prisma'/);
  });
});

// ---------------------------------------------------------------------------
// Inheritance test (Requirement 8.3 / design Property P6): an app that only
// calls `createApp()` exposes `fastify.notifications` WITHOUT any local
// registration of the plugin.
// ---------------------------------------------------------------------------
describe('notifications inheritance via createApp() (Property P6)', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('exposes a usable `fastify.notifications` with no per-app registration', async () => {
    // NOTE: createApp() is called with NO local notifications registration.
    app = await createApp(testConfig);
    await app.ready();

    expect(app.hasDecorator('notifications')).toBe(true);
    expect(app.notifications.preferences).toBeInstanceOf(PreferenceService);
    expect(app.notifications.fanout).toBeInstanceOf(NotificationFanout);
    expect(app.notifications.dispatcher).toBeInstanceOf(CrossAppDispatcher);

    // inherited service is wired and usable end-to-end
    const result = app.notifications.dispatcher.notifyNewMessage(
      ['user-1'],
      'Alice',
      'hello world',
      'conv-1',
    );
    expect(result.sourceApp).toBe('server-core');
    expect(result.routedCount).toBe(1);
  });
});
