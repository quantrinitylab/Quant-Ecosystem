// ============================================================================
// Agent Gateway — App Endpoint Registry
// ============================================================================
// @deprecated (WR-AI-002) — DO NOT import in new code.
//
// Canonical route resolution lives in ./canonical-endpoints.ts, which resolves
// method+path+availability from the @quant/app-registry catalog. This module
// remains ONLY as a thin backwards-compatible shim: every export below is
// DERIVED from the registry at import time — there is no hardcoded route
// table here anymore.
//
// The old table's stale routes (quantchat.send-message -> POST /messages,
// quantchat.search -> GET /messages/search, localhost:3999 placeholders) are
// gone: the shim exposes the canonical routes instead.
//
// Removal: after the #382 single-source-of-truth agreement lands and all
// consumers migrate to ./canonical-endpoints.
// ============================================================================

import {
  allResolvedToolEndpoints,
  checkAppHealth as canonicalCheckAppHealth,
  resolveToolEndpoint,
  type HttpMethod,
} from './canonical-endpoints';

export type { HttpMethod };

export interface ToolRoute {
  method: HttpMethod;
  /** Path on the target app backend, e.g. '/emails' */
  path: string;
}

export interface AppEndpoint {
  /** e.g. 'quantmail' — the owning app from the canonical routeRef */
  appId: string;
  /** Base URL of the app's backend, no trailing slash */
  baseUrl: string;
  /** Health-check path, e.g. '/health' */
  healthPath: string;
  /** Per-request timeout in ms */
  timeoutMs: number;
  /** toolId -> HTTP route, derived from the canonical registry */
  toolRoutes: Record<string, ToolRoute>;
}

/**
 * @deprecated — derived from the canonical registry; prefer
 * allResolvedToolEndpoint()/gatewayApps() from ./canonical-endpoints.
 */
export const APP_ENDPOINTS: AppEndpoint[] = (() => {
  const byApp = new Map<string, AppEndpoint>();
  for (const { toolId, ...resolved } of allResolvedToolEndpoints()) {
    let ep = byApp.get(resolved.appId);
    if (!ep) {
      ep = {
        appId: resolved.appId,
        baseUrl: resolved.baseUrl,
        healthPath: resolved.healthPath,
        timeoutMs: resolved.timeoutMs,
        toolRoutes: {},
      };
      byApp.set(resolved.appId, ep);
    }
    ep.toolRoutes[toolId] = { method: resolved.method, path: resolved.path };
  }
  return [...byApp.values()];
})();

/**
 * @deprecated — prefer resolveToolEndpoint(toolId) from ./canonical-endpoints.
 * Returns the endpoint for an appId, or undefined when unknown.
 */
export function getEndpoint(appId: string): AppEndpoint | undefined {
  return APP_ENDPOINTS.find((e) => e.appId === appId);
}

/**
 * @deprecated — prefer resolveToolEndpoint(toolId) from ./canonical-endpoints.
 * Returns the HTTP route for a toolId, or undefined when unmapped.
 */
export function getToolRoute(appId: string, toolId: string): ToolRoute | undefined {
  const resolved = resolveToolEndpoint(toolId);
  if (!resolved || resolved.appId !== appId) return undefined;
  return { method: resolved.method, path: resolved.path };
}

/**
 * @deprecated — prefer checkAppHealth from ./canonical-endpoints.
 * Quick reachability probe used by GET /agentic/apps/health.
 */
export async function checkAppHealth(appId: string): Promise<{
  appId: string;
  reachable: boolean;
  latencyMs: number;
  toolCount: number;
}> {
  return canonicalCheckAppHealth(appId);
}
