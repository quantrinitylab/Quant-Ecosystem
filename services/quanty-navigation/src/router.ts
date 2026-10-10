/**
 * Quanty handoff intent router.
 *
 * Pure resolution logic: given a handoff intent, pick the target route from
 * the navigation registry. This module performs no navigation, opens no
 * apps, and calls no product APIs — it only answers "where would this
 * intent go?".
 *
 * Resolution order:
 *   1. explicit routeId  -> "exact"
 *   2. route whose actions include the intent action -> "action"
 *   3. the app's default route -> "default"
 *   4. nothing registered for the app -> null
 */

import type { NavigationRegistry, QuantyRoute } from './registry';

export interface HandoffIntent {
  intentId: string;
  sessionId: string;
  sourceAppId: string;
  targetAppId: string;
  /** Well-known values: "open" | "view" | "compose" | "search" | "create" | "edit". */
  action: string;
  /** Explicit route when the caller already knows the destination. */
  routeId?: string;
  resourceRefs?: string[];
  params?: Record<string, string>;
  contextScope?: string[];
}

export type ResolutionConfidence = 'exact' | 'action' | 'default';

export interface ResolvedRoute {
  route: QuantyRoute;
  params: Record<string, string>;
  confidence: ResolutionConfidence;
  /** Human-readable explanation, e.g. for the visible mode UI. */
  reason: string;
}

export class IntentRouter {
  constructor(private readonly registry: NavigationRegistry) {}

  /**
   * Resolve an intent to a target route. Returns null only when the target
   * app has no routes registered at all (or the explicit routeId is
   * unknown). Throws on malformed intents.
   */
  resolve(intent: HandoffIntent): ResolvedRoute | null {
    this.assertIntent(intent);
    const params = { ...(intent.params ?? {}) };

    if (intent.routeId) {
      const route = this.registry.get(intent.targetAppId, intent.routeId);
      if (!route) return null;
      return {
        route,
        params,
        confidence: 'exact',
        reason: `explicit route "${intent.routeId}"`,
      };
    }

    const byAction = this.registry
      .list(intent.targetAppId)
      .find((r) => r.actions?.includes(intent.action));
    if (byAction) {
      return {
        route: byAction,
        params,
        confidence: 'action',
        reason: `route "${byAction.routeId}" handles action "${intent.action}"`,
      };
    }

    const fallback = this.registry.defaultRoute(intent.targetAppId);
    if (fallback) {
      return {
        route: fallback,
        params,
        confidence: 'default',
        reason: `no route for action "${intent.action}"; fell back to app default "${fallback.routeId}"`,
      };
    }

    return null;
  }

  private assertIntent(intent: HandoffIntent): void {
    if (!intent.intentId) throw new Error('INTENT_ID_REQUIRED');
    if (!intent.sessionId) throw new Error('INTENT_SESSION_REQUIRED');
    if (!intent.targetAppId) throw new Error('INTENT_TARGET_REQUIRED');
    if (!intent.action) throw new Error('INTENT_ACTION_REQUIRED');
  }
}
