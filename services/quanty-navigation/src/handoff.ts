/**
 * Quanty handoff payload contracts.
 *
 * A handoff is a signed-by-construction, serializable description of "take
 * this intent to that route" that a product shell can consume. Building and
 * validating the payload is pure data logic — there is no execution here:
 * no app is opened, no session is moved, no token is minted.
 */

import type { QuantyRoute } from './registry';
import type { HandoffIntent, ResolvedRoute } from './router';

export interface HandoffRequest {
  handoffId: string;
  intent: HandoffIntent;
  route: QuantyRoute;
  params: Record<string, string>;
  /** Concrete deep link with every ":param" substituted. */
  deepLink: string;
  contextScope: string[];
  resourceRefs: string[];
  issuedAt: string;
  expiresAt: string;
}

export interface HandoffValidation {
  valid: boolean;
  reason?: string;
}

export interface CreateHandoffOptions {
  handoffId?: string;
  /** Milliseconds from issuance until expiry. Defaults to 5 minutes. */
  ttlMs?: number;
  nowMs?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function defaultHandoffId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Substitute ":param" segments in a route pattern. Throws when a required
 * parameter is missing so malformed handoffs fail loudly at build time.
 */
export function buildDeepLink(route: QuantyRoute, params: Record<string, string>): string {
  const missing: string[] = [];
  const link = route.path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment;
      const name = segment.slice(1);
      const value = params[name];
      if (value === undefined) {
        missing.push(name);
        return segment;
      }
      return encodeURIComponent(value);
    })
    .join('/');
  if (missing.length > 0) {
    throw new Error(`HANDOFF_MISSING_PARAMS:${missing.join(',')}`);
  }
  return link;
}

/**
 * Build the handoff payload from a resolved intent. Pure construction —
 * the returned object is data for the product shell to consume.
 */
export function createHandoff(
  intent: HandoffIntent,
  resolved: ResolvedRoute,
  options: CreateHandoffOptions = {},
): HandoffRequest {
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (ttlMs <= 0) throw new Error('HANDOFF_TTL_MUST_BE_POSITIVE');
  return {
    handoffId: options.handoffId ?? defaultHandoffId(),
    intent: { ...intent, params: { ...(intent.params ?? {}) } },
    route: { ...resolved.route },
    params: { ...resolved.params },
    deepLink: buildDeepLink(resolved.route, resolved.params),
    contextScope: [...(intent.contextScope ?? [])],
    resourceRefs: [...(intent.resourceRefs ?? [])],
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
  };
}

/**
 * Validate a handoff payload: required fields present, route pattern fully
 * substituted, and not expired. Returns a reason instead of throwing so
 * shells can surface it in the visible mode UI.
 */
export function validateHandoff(handoff: HandoffRequest, nowMs: number = Date.now()): HandoffValidation {
  if (!handoff.handoffId) return { valid: false, reason: 'missing handoffId' };
  if (!handoff.intent?.intentId) return { valid: false, reason: 'missing intent.intentId' };
  if (!handoff.intent?.targetAppId) return { valid: false, reason: 'missing intent.targetAppId' };
  if (!handoff.route?.routeId || !handoff.route?.path) return { valid: false, reason: 'missing route' };
  if (!handoff.deepLink || handoff.deepLink.includes(':')) {
    return { valid: false, reason: 'deepLink has unsubstituted parameters' };
  }
  const expiresMs = Date.parse(handoff.expiresAt);
  if (Number.isNaN(expiresMs)) return { valid: false, reason: 'invalid expiresAt' };
  if (nowMs >= expiresMs) return { valid: false, reason: 'handoff expired' };
  return { valid: true };
}
