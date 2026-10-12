// ============================================================================
// QuantAI — ecosystem single-logout wiring (F-182).
//
// QuantAI owns its session in services/auth-session.ts and never registers it
// with the shared UniversalSSOTokenBridge, so the bridge's GLOBAL_LOGOUT path
// was dead-wired here: broadcastSSOEvent() no-ops when the bridge holds no
// session, and nothing in the app ever listened for GLOBAL_LOGOUT. The result:
// logging out of QuantAI left the QuantMail identity session and every other
// app's tabs/sessions alive.
//
// This module wires both directions using ONLY the bridge's public API
// (shared-ui internals are untouched):
//   1. broadcastGlobalLogout() — called from authSession.logout(); seeds a
//      broadcast-only bridge session (the guard broadcastSSOEvent requires)
//      and emits GLOBAL_LOGOUT on the `quant_sso_bus` so sibling apps/tabs
//      close their sessions.
//   2. subscribeToGlobalLogout() — a QuantMail-side (or any remote) logout
//      must log QuantAI out too; the handler clears this tab's session.
// ============================================================================
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import type { SSOEventMessage } from '@quant/shared-ui';

/**
 * Marker carried in the payload of a genuine QuantAI-initiated ecosystem
 * logout. The bridge's own fail-closed refresh timer can emit a marker-less
 * GLOBAL_LOGOUT from a stale seeded session after we've logged out; the
 * listener below must not mistake that echo for a fresh remote logout.
 */
export const ECOSYSTEM_LOGOUT_MARKER = 'quantai-ecosystem-logout-v1';

/**
 * TTL for the broadcast-only bridge session seed. QuantAI rotates its own
 * tokens via /auth/refresh — the bridge's refresh timer is meaningless here —
 * so this is deliberately long: it exists only to satisfy broadcastSSOEvent's
 * session guard at logout time.
 */
const BROADCAST_SEED_TTL_SECONDS = 24 * 3600;

export interface EcosystemLogoutResult {
  /** True when the GLOBAL_LOGOUT broadcast was emitted on the ecosystem bus. */
  broadcasted: boolean;
  /** Machine-readable reason when the broadcast could not be emitted. */
  reason?: 'NO_WINDOW' | 'BUS_UNAVAILABLE';
}

export interface LogoutIdentity {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Broadcast GLOBAL_LOGOUT across the ecosystem bus (BroadcastChannel +
 * localStorage fallback + postMessage, per the shared bridge) so QuantMail
 * and every other Quant app/tab close their sessions.
 *
 * Never throws: a dead bus must not block or resurrect this tab's logout.
 * The caller clears local tokens first and reports `broadcasted: false` in
 * the UI when the ecosystem could not be reached.
 */
export function broadcastGlobalLogout(user?: LogoutIdentity | null): EcosystemLogoutResult {
  if (typeof window === 'undefined') {
    return { broadcasted: false, reason: 'NO_WINDOW' };
  }
  try {
    const bridge = UniversalSSOTokenBridge.getInstance();
    // broadcastSSOEvent() returns silently when the bridge holds no session.
    // QuantAI never registers one (its session lives in auth-session.ts), so
    // seed a broadcast-only tombstone — userId/email are informational for
    // receivers; the event type is what matters.
    bridge.setCurrentSession(
      {
        userId: user?.id ?? '',
        email: user?.email ?? '',
        displayName: user?.name ?? '',
        currentApp: 'quantai',
      },
      BROADCAST_SEED_TTL_SECONDS,
    );
    bridge.broadcastSSOEvent('GLOBAL_LOGOUT', 'quantai', {
      [ECOSYSTEM_LOGOUT_MARKER]: true,
      at: Date.now(),
    });
    return { broadcasted: true };
  } catch {
    return { broadcasted: false, reason: 'BUS_UNAVAILABLE' };
  }
}

/**
 * True when a GLOBAL_LOGOUT bus event should clear this tab's session:
 * - remote apps' logouts (sourceApp !== 'quantai') are always honored —
 *   this is the defense direction: a QuantMail-side logout logs QuantAI out;
 * - our own tab's genuine broadcast carries the marker;
 * - our own tab's marker-less echo (the bridge's post-logout refresh-timer
 *   fail-closed emission from the seeded tombstone) is ignored.
 *
 * Clearing is idempotent: receiving GLOBAL_LOGOUT while already logged out
 * is a no-op, never an error.
 */
export function isGenuineGlobalLogout(event: SSOEventMessage): boolean {
  if (event.sourceApp !== 'quantai') return true;
  return event.payload?.[ECOSYSTEM_LOGOUT_MARKER] === true;
}

/**
 * Subscribe to ecosystem GLOBAL_LOGOUT events. Returns an unsubscribe
 * function. Never throws; safe to call during SSR (returns a no-op).
 */
export function subscribeToGlobalLogout(onGlobalLogout: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  try {
    const bridge = UniversalSSOTokenBridge.getInstance();
    return bridge.on('GLOBAL_LOGOUT', (event) => {
      try {
        if (isGenuineGlobalLogout(event)) onGlobalLogout();
      } catch {
        // A listener must never break the bus for other subscribers.
      }
    });
  } catch {
    return () => undefined;
  }
}
