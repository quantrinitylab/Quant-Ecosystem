// ============================================================================
// Agent Gateway — App Endpoint Registry (Phase 2)
// ============================================================================
// Maps each Quant appId to its backend base URL + the HTTP routes that back
// individual cross-app tools. URLs come from env vars (QUANTAPP_<APP>_URL);
// nothing is hardcoded so staging/prod can point anywhere.
//
// Apps that don't exist yet (or aren't deployed) degrade gracefully:
// getEndpoint() returns undefined and the gateway marks their tools
// unavailable instead of crashing.
// ============================================================================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ToolRoute {
  method: HttpMethod;
  /** Path on the target app backend, e.g. '/emails' */
  path: string;
}

export interface AppEndpoint {
  /** e.g. 'quantmail' — must match ToolDefinition.appId */
  appId: string;
  /** Base URL of the app's backend, no trailing slash */
  baseUrl: string;
  /** Health-check path, e.g. '/health' */
  healthPath: string;
  /** Per-request timeout in ms */
  timeoutMs: number;
  /** toolId -> HTTP route on the target backend */
  toolRoutes: Record<string, ToolRoute>;
}

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim().replace(/\/+$/, '') : fallback;
}

const DEFAULT_TIMEOUT_MS = 15000;

export const APP_ENDPOINTS: AppEndpoint[] = [
  {
    appId: 'quantmail',
    baseUrl: env('QUANTAPP_QUANTMAIL_URL', 'http://localhost:3001'),
    healthPath: '/health',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    toolRoutes: {
      // POST /emails with { toAddresses, subject, bodyPlain/bodyHtml, send: true }
      'quantmail.send': { method: 'POST', path: '/emails' },
      'quantmail.search': { method: 'GET', path: '/emails/search' },
      'quantmail.archive': { method: 'POST', path: '/emails/archive' },
      'quantmail.draft': { method: 'POST', path: '/emails' },
    },
  },
  {
    appId: 'quantchat',
    baseUrl: env('QUANTAPP_QUANTCHAT_URL', 'http://localhost:3002'),
    healthPath: '/health',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    toolRoutes: {
      'quantchat.send-message': { method: 'POST', path: '/messages' },
      'quantchat.search': { method: 'GET', path: '/messages/search' },
    },
  },
  // ------------------------------------------------------------------
  // Apps below have tool definitions but no deployed backend yet.
  // They resolve to a loopback placeholder and are reported unreachable
  // by the health check; their tools stay listed but marked unavailable.
  // ------------------------------------------------------------------
  {
    appId: 'quantcalendar',
    baseUrl: env('QUANTAPP_QUANTCALENDAR_URL', 'http://localhost:3999'),
    healthPath: '/health',
    timeoutMs: 5000,
    toolRoutes: {
      // TODO(phase2): wire to the real calendar backend once deployed.
      'quantcalendar.create-event': { method: 'POST', path: '/events' },
      'quantcalendar.list-today': { method: 'GET', path: '/events/today' },
      'quantcalendar.reschedule': { method: 'PATCH', path: '/events' },
      'quantcalendar.cancel': { method: 'DELETE', path: '/events' },
      'quantcalendar.invite': { method: 'POST', path: '/events/invite' },
    },
  },
  {
    appId: 'quantdrive',
    baseUrl: env('QUANTAPP_QUANTDRIVE_URL', 'http://localhost:3999'),
    healthPath: '/health',
    timeoutMs: 5000,
    toolRoutes: {
      // TODO(phase2): wire to the real drive backend once deployed.
      'quantdrive.list': { method: 'GET', path: '/files' },
      'quantdrive.upload': { method: 'POST', path: '/files' },
    },
  },
];

const byAppId = new Map<string, AppEndpoint>(APP_ENDPOINTS.map((e) => [e.appId, e]));

/** Returns the endpoint for an appId, or undefined when unknown. */
export function getEndpoint(appId: string): AppEndpoint | undefined {
  return byAppId.get(appId);
}

/** Returns the HTTP route for a toolId, or undefined when unmapped. */
export function getToolRoute(appId: string, toolId: string): ToolRoute | undefined {
  return byAppId.get(appId)?.toolRoutes[toolId];
}

/** Quick reachability probe used by GET /agentic/apps/health. */
export async function checkAppHealth(appId: string): Promise<{
  appId: string;
  reachable: boolean;
  latencyMs: number;
  toolCount: number;
}> {
  const ep = byAppId.get(appId);
  const started = Date.now();
  if (!ep) {
    return { appId, reachable: false, latencyMs: 0, toolCount: 0 };
  }
  try {
    const res = await fetch(ep.baseUrl + ep.healthPath, {
      method: 'GET',
      signal: AbortSignal.timeout(Math.min(ep.timeoutMs, 5000)),
    });
    return {
      appId,
      reachable: res.ok,
      latencyMs: Date.now() - started,
      toolCount: Object.keys(ep.toolRoutes).length,
    };
  } catch {
    return {
      appId,
      reachable: false,
      latencyMs: Date.now() - started,
      toolCount: Object.keys(ep.toolRoutes).length,
    };
  }
}
