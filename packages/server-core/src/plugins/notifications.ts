import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { PreferenceService, NotificationFanout, CrossAppDispatcher } from '@quant/notifications';

// Cross-cutting notifications substrate (Category A). Wired ONCE in
// `createApp()` after `prisma` (declares `dependencies: ['prisma']`), so every
// app inherits `fastify.notifications` through `createApp()` without any
// per-app registration (Requirements 2.1, 2.2, 2.4, 2.5; design Property P6).
//
// The engine (`@quant/notifications`) exports in-memory service classes:
//   - PreferenceService()                     — per-user/type/channel preferences
//   - NotificationFanout(preferenceService)   — routes events to recipients
//   - CrossAppDispatcher(sourceApp)            — simple cross-app dispatch facade
//
// These services keep their own in-memory state and do not require a database
// client, so — unlike `prisma.ts` — none are constructed FROM `fastify.prisma`
// (Requirement 1.3 only mandates injecting the shared singleton WHEN an engine
// needs DB access; here it does not). The plugin still declares
// `dependencies: ['prisma']` so it always registers after `prismaPlugin`,
// matching the documented seam convention (see plugins/README.md) and keeping
// the door open for engine services that later persist via the shared client.

/** Shape decorated onto the instance as `fastify.notifications`. */
export interface NotificationsService {
  /** Per-user / per-type / per-channel notification preferences. */
  preferences: PreferenceService;
  /** Preference-aware fan-out of events to recipients. */
  fanout: NotificationFanout;
  /** Cross-app dispatch facade (sourceApp = `server-core`). */
  dispatcher: CrossAppDispatcher;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Shared notifications engine from `@quant/notifications`. */
    notifications: NotificationsService;
  }
}

async function notificationsPlugin(fastify: FastifyInstance) {
  // Construct the engine's services once at boot (decorated singletons), never
  // per-request — mirroring `prisma.ts`.
  const preferences = new PreferenceService();
  const fanout = new NotificationFanout(preferences);
  const dispatcher = new CrossAppDispatcher('server-core');

  const service: NotificationsService = { preferences, fanout, dispatcher };

  fastify.decorate('notifications', service);

  // Release engine resources on shutdown. The current services are in-memory so
  // there is nothing external to disconnect, but we register the cleanup hook
  // (a) to satisfy the seam convention's `onClose` step and (b) to forward to a
  // `shutdown()` lifecycle if a service later acquires external resources
  // (timers, queues, push transports). Optional-chaining keeps it a safe no-op
  // for the in-memory services that exist today.
  fastify.addHook('onClose', async () => {
    await (dispatcher as { shutdown?: () => Promise<void> | void }).shutdown?.();
    await (fanout as { shutdown?: () => Promise<void> | void }).shutdown?.();
    await (preferences as { shutdown?: () => Promise<void> | void }).shutdown?.();
  });
}

export default fp(notificationsPlugin, {
  name: 'notifications',
  dependencies: ['prisma'],
});
