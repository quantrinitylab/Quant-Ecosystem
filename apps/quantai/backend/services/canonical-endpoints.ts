// ============================================================================
// Agent Gateway — Canonical Endpoint Resolution (WR-AI-002)
// ============================================================================
// Resolves cross-app tool routes from the canonical @quant/app-registry
// catalog instead of a hardcoded route table (the old app-endpoints.ts,
// now a deprecated shim).
//
// Ownership model:
// - METHOD + PATH + AVAILABILITY come from the registry (single source of
//   truth). Unknown capability, non-'active' status, or missing routeRef
//   resolves to undefined — fail closed, the gateway registers no handler.
// - This module owns only the *binding* (gateway toolId -> capabilityId),
//   the deployment config (baseUrl from env), and path-param wiring.
// - Capabilities that are real and verified in this repo but not yet in the
//   canonical catalog are registered here through the registry's public
//   register() extension API, each with routeFile evidence. Long term they
//   belong in packages/app-registry itself — tracked as #382 follow-ups.
// ============================================================================

import {
  buildCapabilityRegistry,
  type Capability,
  type CapabilityKind,
  type CapabilityRegistry,
  type QuantAppId,
  type RiskTier,
  type RouteRef,
} from '@quant/app-registry';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ResolvedEndpoint {
  /** Owning app whose backend serves the route (from the canonical routeRef). */
  appId: string;
  /** Base URL of the owning app backend, no trailing slash (env-driven). */
  baseUrl: string;
  /** Health-check path. */
  healthPath: string;
  /** Per-request timeout in ms. */
  timeoutMs: number;
  method: HttpMethod;
  /** Mounted path; may contain :param segments substituted at call time. */
  path: string;
  capabilityId: string;
  /**
   * Path-segment wiring: ':name' -> candidate tool-param keys, first present
   * wins. Missing value at call time fails closed.
   */
  pathParams: Record<string, string[]>;
}

interface ToolBinding {
  capability: string;
  pathParams?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Deployment config (not routes): which env var holds each owning app's URL.
// ---------------------------------------------------------------------------

const APP_URL_ENV: Record<string, { env: string; fallback: string; timeoutMs: number }> = {
  quantmail: {
    env: 'QUANTAPP_QUANTMAIL_URL',
    fallback: 'http://localhost:3001',
    timeoutMs: 15000,
  },
  quantchat: {
    env: 'QUANTAPP_QUANTCHAT_URL',
    fallback: 'http://localhost:3002',
    timeoutMs: 15000,
  },
};

const HEALTH_PATH = '/health';

function baseUrlFor(appId: string): string | undefined {
  const cfg = APP_URL_ENV[appId];
  if (!cfg) return undefined;
  const v = process.env[cfg.env];
  const raw = v && v.trim() ? v.trim() : cfg.fallback;
  return raw.replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// Lane-registered extension capabilities.
//
// Verified real routes in this repo that the canonical catalog does not list
// yet. Registered through CapabilityRegistry.register() — the registry's
// public extension API — never by editing the canonical catalog (that needs
// the #382 single-source-of-truth agreement). Each carries routeFile
// evidence; verification.successEvents are intentionally NOT claimed until
// the owning lane declares them.
// ---------------------------------------------------------------------------

interface ExtInput {
  id: string;
  app: QuantAppId;
  domain: string;
  kind: CapabilityKind;
  routeFile: string;
  method: RouteRef['method'];
  /** Mounted path as served (prefix included), e.g. '/search'. */
  path: string;
  scopes: string[];
  risk: RiskTier;
  degraded: string;
  note: string;
}

function extensionCapability(input: ExtInput): Capability {
  const isCommand = input.kind === 'command';
  return {
    capabilityId: input.id,
    version: 1,
    appId: input.app,
    domain: input.domain,
    kind: input.kind,
    owner: {
      appId: input.app,
      sourceOfTruth: `lane-registered extension (WR-AI-002); canonical owner: ${input.app} lane — see #382`,
    },
    resourceTypes: [],
    inputSchema: `${input.id}/v1/input`,
    outputSchema: `${input.id}/v1/output`,
    requiredScopes: input.scopes,
    riskTier: input.risk,
    idempotency: {
      required: isCommand,
      keyStrategy: isCommand ? 'client-supplied' : undefined,
    },
    approval: { required: false },
    verification: {
      // Not claimed: the owning lane has not declared success events yet.
      required: false,
      successEvents: [],
      timeoutState: 'unknown',
    },
    emits: [],
    degradedMode: { mode: 'fail_closed', userState: input.degraded },
    status: 'active',
    routeRef: {
      appId: input.app,
      routeFile: input.routeFile,
      method: input.method,
      path: `${input.method} ${input.path}`,
    },
    note: input.note,
  };
}

const EXTENSION_CAPABILITIES: ExtInput[] = [
  {
    id: 'chat.search.query',
    app: 'quantchat',
    domain: 'search',
    kind: 'query',
    routeFile: 'apps/quantchat/backend/routes/search.ts',
    method: 'POST',
    path: '/search',
    scopes: ['chat:read'],
    risk: 0,
    degraded: 'Chat search unavailable right now.',
    note: 'Real route: searchRoutes mounted at /search (apps/quantchat/backend/app.ts). Replaces the stale GET /messages/search.',
  },
  {
    id: 'mail.calendar.event.create',
    app: 'quantmail',
    domain: 'calendar',
    kind: 'command',
    routeFile: 'apps/quantmail/backend/routes/calendar.ts',
    method: 'POST',
    path: '/events',
    scopes: ['calendar:write'],
    risk: 1,
    degraded: 'Calendar unavailable — event not created.',
    note: 'Real route: calendarRoutes mounted at root (apps/quantmail/backend/app.ts). Replaces the localhost:3999 placeholder.',
  },
  {
    id: 'mail.calendar.event.upcoming',
    app: 'quantmail',
    domain: 'calendar',
    kind: 'query',
    routeFile: 'apps/quantmail/backend/routes/calendar.ts',
    method: 'GET',
    path: '/events/upcoming',
    scopes: ['calendar:read'],
    risk: 0,
    degraded: 'Calendar unavailable — cannot list events right now.',
    note: 'Closest real endpoint for "today\'s events"; callers filter by day. Replaces the localhost:3999 placeholder.',
  },
  {
    id: 'mail.calendar.event.update',
    app: 'quantmail',
    domain: 'calendar',
    kind: 'command',
    routeFile: 'apps/quantmail/backend/routes/calendar.ts',
    method: 'PATCH',
    path: '/events/:id',
    scopes: ['calendar:write'],
    risk: 2,
    degraded: 'Calendar unavailable — event not updated.',
    note: 'Real route: PATCH /events/:id -> updateEvent. Replaces the localhost:3999 placeholder.',
  },
  {
    id: 'mail.drive.search',
    app: 'quantmail',
    domain: 'drive',
    kind: 'query',
    routeFile: 'apps/quantmail/backend/routes/drive.ts',
    method: 'GET',
    path: '/drive/search',
    scopes: ['drive:read'],
    risk: 0,
    degraded: 'Drive search unavailable right now.',
    note: 'Real route: driveRoutes mounted at root. Replaces the localhost:3999 placeholder.',
  },
  {
    id: 'mail.drive.file.share',
    app: 'quantmail',
    domain: 'drive',
    kind: 'command',
    routeFile: 'apps/quantmail/backend/routes/drive.ts',
    method: 'POST',
    path: '/drive/files/:id/share',
    scopes: ['drive:write'],
    risk: 2,
    degraded: 'Drive unavailable — file not shared.',
    note: 'Real route: POST /drive/files/:id/share. Replaces the localhost:3999 placeholder.',
  },
];

/** Build a registry with the canonical catalog + verified lane extensions. */
export function buildGatewayRegistry(): CapabilityRegistry {
  const registry = buildCapabilityRegistry();
  for (const ext of EXTENSION_CAPABILITIES) {
    registry.register(extensionCapability(ext));
  }
  return registry;
}

let singleton: CapabilityRegistry | null = null;

/** Process-wide registry: canonical catalog + lane extensions, built once. */
export function getGatewayRegistry(): CapabilityRegistry {
  if (!singleton) singleton = buildGatewayRegistry();
  return singleton;
}

// ---------------------------------------------------------------------------
// Tool -> capability binding (semantic catalog binding, NOT a route table).
// Routes (method/path/status) always come from the registry at resolve time.
// ---------------------------------------------------------------------------

const TOOL_CAPABILITY_BINDING: Record<string, ToolBinding> = {
  // NOTE: quantmail.send hits POST /emails/ (handleComposeOrSend) with
  // send:true — a single-shot compose+send. mail.draft.create owns that
  // route in the canonical catalog; the send side effect is gated by the
  // tool catalog's permission tier, not by a separate capability.
  'quantmail.send': { capability: 'mail.draft.create' },
  'quantmail.search': { capability: 'mail.thread.search' },
  'quantmail.archive': {
    capability: 'mail.thread.archive',
    pathParams: { id: ['messageId', 'threadId', 'id'] },
  },
  'quantmail.draft': { capability: 'mail.draft.create' },
  'quantchat.send': {
    capability: 'chat.message.send',
    pathParams: { id: ['channelId', 'conversationId', 'id'] },
  },
  'quantchat.search': { capability: 'chat.search.query' },
  'quantchat.create-channel': { capability: 'chat.conversation.create' },
  'quantcalendar.create-event': { capability: 'mail.calendar.event.create' },
  'quantcalendar.list-today': { capability: 'mail.calendar.event.upcoming' },
  'quantcalendar.reschedule': {
    capability: 'mail.calendar.event.update',
    pathParams: { id: ['eventId', 'id'] },
  },
  'quantdrive.search': { capability: 'mail.drive.search' },
  'quantdrive.share': {
    capability: 'mail.drive.file.share',
    pathParams: { id: ['fileId', 'id'] },
  },
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Normalize a canonical routeRef path for HTTP use:
 * strips the leading 'METHOD ' prefix, trailing doc annotations like
 * ' (compose)', and a trailing slash. ':param' segments are preserved.
 */
export function normalizeRoutePath(routePath: string): string {
  let p = routePath.replace(/^[A-Z]+\s+/, '').replace(/\s*\(.*\)\s*$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/**
 * Resolve one canonical capability to an HTTP endpoint. Fail-closed:
 * returns undefined for unknown capabilities, non-'active' status
 * (preview/disabled/deprecated are honestly unavailable), missing routeRef,
 * or an owning app with no deployment config.
 */
export function resolveCapabilityEndpoint(
  registry: CapabilityRegistry,
  capabilityId: string,
  pathParams?: Record<string, string[]>,
): ResolvedEndpoint | undefined {
  let capability: Capability;
  try {
    capability = registry.resolve(capabilityId);
  } catch {
    return undefined;
  }
  if (capability.status !== 'active') return undefined;
  const routeRef = capability.routeRef;
  if (!routeRef) return undefined;
  const baseUrl = baseUrlFor(routeRef.appId);
  if (!baseUrl) return undefined;
  return {
    appId: routeRef.appId,
    baseUrl,
    healthPath: HEALTH_PATH,
    timeoutMs: APP_URL_ENV[routeRef.appId]?.timeoutMs ?? 15000,
    method: routeRef.method,
    path: normalizeRoutePath(routeRef.path),
    capabilityId: capability.capabilityId,
    pathParams: pathParams ?? {},
  };
}

/**
 * Resolve a gateway toolId to its HTTP endpoint via the canonical registry.
 * Returns undefined when the tool has no binding or the bound capability
 * is not actively wired — the gateway then registers no handler and the
 * tool stays honestly unavailable.
 */
export function resolveToolEndpoint(toolId: string): ResolvedEndpoint | undefined {
  const binding = TOOL_CAPABILITY_BINDING[toolId];
  if (!binding) return undefined;
  return resolveCapabilityEndpoint(
    getGatewayRegistry(),
    binding.capability,
    binding.pathParams,
  );
}

/** Owning appIds that back at least one bound tool (for the health endpoint). */
export function gatewayApps(): string[] {
  const apps = new Set<string>();
  for (const entry of allResolvedToolEndpoints()) apps.add(entry.appId);
  return [...apps].sort();
}

/**
 * Every bound tool with its resolved endpoint. Used by the deprecated
 * app-endpoints shim to build its legacy view — not for new code.
 */
export function allResolvedToolEndpoints(): Array<{ toolId: string } & ResolvedEndpoint> {
  const out: Array<{ toolId: string } & ResolvedEndpoint> = [];
  for (const toolId of Object.keys(TOOL_CAPABILITY_BINDING)) {
    const binding = TOOL_CAPABILITY_BINDING[toolId];
    const resolved = resolveCapabilityEndpoint(
      getGatewayRegistry(),
      binding.capability,
      binding.pathParams,
    );
    if (resolved) out.push({ toolId, ...resolved });
  }
  return out;
}

/** Number of bound tools resolving to one owning app (for the health endpoint). */
export function gatewayToolCount(appId: string): number {
  return allResolvedToolEndpoints().filter((e) => e.appId === appId).length;
}

/** Quick reachability probe used by GET /agentic/apps/health. */
export async function checkAppHealth(appId: string): Promise<{
  appId: string;
  reachable: boolean;
  latencyMs: number;
  toolCount: number;
}> {
  const baseUrl = baseUrlFor(appId);
  const started = Date.now();
  if (!baseUrl) {
    return { appId, reachable: false, latencyMs: 0, toolCount: 0 };
  }
  const timeoutMs = APP_URL_ENV[appId]?.timeoutMs ?? 15000;
  try {
    const res = await fetch(baseUrl + HEALTH_PATH, {
      method: 'GET',
      signal: AbortSignal.timeout(Math.min(timeoutMs, 5000)),
    });
    return {
      appId,
      reachable: res.ok,
      latencyMs: Date.now() - started,
      toolCount: gatewayToolCount(appId),
    };
  } catch {
    return {
      appId,
      reachable: false,
      latencyMs: Date.now() - started,
      toolCount: gatewayToolCount(appId),
    };
  }
}
