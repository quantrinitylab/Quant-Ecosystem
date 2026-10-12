// ============================================================================
// QuantAI — cross-tab / cross-app session sync over the ecosystem bus (F-189).
//
// What was missing: the auth-provider never subscribed to the shared
// `quant_sso_bus` for SESSION_INITIALIZED / TOKEN_REFRESHED, so
//   (a) signing in on a second QuantAI tab (SSO ticket flow) left the first
//       tab signed out until a manual reload, and
//   (b) a token rotated by one tab left every other tab on a stale in-memory
//       token (lib/auth's memoryToken cache prefers the stale value over the
//       fresh localStorage value) until each tab's own 12-minute refresh.
//
// This module wires both directions using ONLY the bridge's public API
// (shared-ui internals are untouched), mirroring services/ecosystem-logout.ts
// (F-182):
//   1. subscribeToSessionInitialized() / subscribeToTokenRefreshed() —
//      listeners the auth-provider mounts once; safe no-ops during SSR and
//      when the bus is unavailable. A listener must never break the bus for
//      other subscribers.
//   2. broadcastSessionInitialized() / broadcastTokenRefreshed() — emitted
//      after this tab establishes / rotates a session, so sibling tabs pick
//      it up. broadcastSSOEvent() no-ops when the bridge holds no session and
//      QuantAI's password flow never registers one, so a broadcast-only seed
//      is planted first (same technique as F-182) — but ONLY when the bridge
//      has no session, so a real ticket-flow session (with its own refresh
//      timer) is never clobbered. The seed carries the real signed-in user
//      from lib/auth when available, never a fabricated identity.
//
// Security notes:
//   - Bus events carry NO token (bridge design). Adoption is always gated on
//     a real token present in this origin's localStorage — a forged event can
//     at worst trigger a no-op re-read, never a fabricated session.
//   - TOKEN_REFRESHED never resurrects a logged-out tab: receivers ignore it
//     unless they are currently authenticated.
// ============================================================================
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import type { SSOEventMessage } from '@quant/shared-ui';
import { getAuthUser } from '../lib/auth';

const SESSION_SYNC_SEED_TTL_SECONDS = 24 * 3600;

export interface SessionSyncBroadcastResult {
  /** True when the event was emitted on the ecosystem bus. */
  broadcasted: boolean;
  /** Machine-readable reason when the broadcast could not be emitted. */
  reason?: 'NO_WINDOW' | 'BUS_UNAVAILABLE';
}

function seedBridgeSessionIfAbsent(): boolean {
  const bridge = UniversalSSOTokenBridge.getInstance();
  if (bridge.getCurrentSession()) return true;
  // Real identity only — getAuthUser() returns the server-verified profile
  // persisted at login/refresh, or null when signed out.
  const user = getAuthUser();
  bridge.setCurrentSession(
    {
      userId: user?.id ?? '',
      email: user?.email ?? '',
      displayName: user?.name ?? '',
      currentApp: 'quantai',
    },
    SESSION_SYNC_SEED_TTL_SECONDS,
  );
  return true;
}

function emit(type: 'SESSION_INITIALIZED' | 'TOKEN_REFRESHED'): SessionSyncBroadcastResult {
  if (typeof window === 'undefined') {
    return { broadcasted: false, reason: 'NO_WINDOW' };
  }
  try {
    seedBridgeSessionIfAbsent();
    UniversalSSOTokenBridge.getInstance().broadcastSSOEvent(type, 'quantai', {
      at: Date.now(),
    });
    return { broadcasted: true };
  } catch {
    return { broadcasted: false, reason: 'BUS_UNAVAILABLE' };
  }
}

/**
 * Announce that this tab established a session (password login), so sibling
 * QuantAI tabs adopt it instead of sitting signed-out. Never throws: a dead
 * bus must not break login.
 */
export function broadcastSessionInitialized(): SessionSyncBroadcastResult {
  return emit('SESSION_INITIALIZED');
}

/**
 * Announce that this tab rotated its access token, so sibling tabs re-read
 * the fresh token from storage instead of calling APIs with a stale one.
 * Never throws: a dead bus must not break the refresh cycle.
 */
export function broadcastTokenRefreshed(): SessionSyncBroadcastResult {
  return emit('TOKEN_REFRESHED');
}

type SessionSyncHandler = (event: SSOEventMessage) => void;

function subscribe(
  type: 'SESSION_INITIALIZED' | 'TOKEN_REFRESHED',
  handler: SessionSyncHandler,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  try {
    const bridge = UniversalSSOTokenBridge.getInstance();
    return bridge.on(type, (event) => {
      try {
        handler(event);
      } catch {
        // A listener must never break the bus for other subscribers.
      }
    });
  } catch {
    return () => undefined;
  }
}

/**
 * Subscribe to ecosystem SESSION_INITIALIZED events. Returns an unsubscribe
 * function. Never throws; safe to call during SSR (returns a no-op).
 */
export function subscribeToSessionInitialized(handler: SessionSyncHandler): () => void {
  return subscribe('SESSION_INITIALIZED', handler);
}

/**
 * Subscribe to ecosystem TOKEN_REFRESHED events. Returns an unsubscribe
 * function. Never throws; safe to call during SSR (returns a no-op).
 */
export function subscribeToTokenRefreshed(handler: SessionSyncHandler): () => void {
  return subscribe('TOKEN_REFRESHED', handler);
}
