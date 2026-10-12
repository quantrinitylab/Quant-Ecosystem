// ============================================================================
// Agent Gateway — HTTP Tool Handler Factory (Phase 2)
// ============================================================================
// Creates real ToolExecutor handlers that forward the caller's JWT to the
// target app's backend over HTTPS. This is what turns "No handler registered"
// into actual cross-app execution.
//
// Auth model: delegated user JWT (context.metadata.jwt), never a service key.
// The JWT is extracted by the /agentic/chat route from the incoming
// Authorization header and placed into ToolExecutionContext.metadata.
// ============================================================================

import type { ToolExecutionContext, ToolHandler } from '@quant/quant-tools';
import type { HttpMethod, ResolvedEndpoint } from './canonical-endpoints';

/** Minimal endpoint view the handler needs (subset of ResolvedEndpoint). */
export interface HandlerEndpoint {
  appId: string;
  baseUrl: string;
  timeoutMs: number;
}

/** Minimal route view the handler needs (subset of ResolvedEndpoint). */
export interface HandlerRoute {
  method: HttpMethod;
  path: string;
}

export interface HttpHandlerOptions {
  endpoint: HandlerEndpoint;
  toolId: string;
  route: HandlerRoute;
  /**
   * Path-segment wiring: ':name' -> candidate tool-param keys, first present
   * wins. A missing value fails closed before any request is sent.
   */
  pathParams?: Record<string, string[]>;
  /**
   * Maps tool params (agent-facing schema) to the target API's body shape.
   * Defaults to passing params through unchanged.
   */
  mapParams?: (params: Record<string, unknown>) => Record<string, unknown>;
  /** Extra headers merged into every request. */
  extraHeaders?: Record<string, string>;
}

function toQueryString(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * Substitute ':param' segments in a canonical route path from the tool params.
 * Throws (fail closed) when a segment has no usable value — a half-built URL
 * must never be requested.
 */
export function substitutePathParams(
  path: string,
  params: Record<string, unknown>,
  mapping: Record<string, string[]> = {},
): string {
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (match, name: string) => {
    const candidates = mapping[name] ?? [name];
    for (const key of candidates) {
      const v = params[key];
      if (v !== undefined && v !== null && String(v) !== '') {
        return encodeURIComponent(String(v));
      }
    }
    throw new Error(
      `Cannot build request path '${path}': missing value for ':${name}' ` +
        `(tried params: ${candidates.join(', ')})`,
    );
  });
}

/**
 * Build a ToolHandler that executes a cross-app tool over HTTP.
 * Throws when the caller's JWT is missing (fail closed) or the app errors.
 */
export function createHttpToolHandler(opts: HttpHandlerOptions): ToolHandler {
  const { endpoint, toolId, route, pathParams, mapParams, extraHeaders } = opts;

  return async (
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> => {
    const jwt = context.metadata?.['jwt'];
    if (!jwt) {
      throw new Error(
        `Cannot execute '${toolId}': missing user JWT in execution context (delegated auth required)`,
      );
    }

    const body = mapParams ? mapParams(params) : params;
    // Path params are read from the ORIGINAL params (pre-mapping), so a
    // mapper never has to preserve routing keys in the body.
    const resolvedPath = substitutePathParams(route.path, params, pathParams);
    const url =
      endpoint.baseUrl +
      resolvedPath +
      (route.method === 'GET' ? toQueryString(body) : '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-request-id': context.metadata?.['requestId'] ?? `agentic-${Date.now()}`,
      'x-agent': 'quantai-gateway/2.0',
      'x-user-id': context.userId,
      ...extraHeaders,
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: route.method,
        headers,
        body: route.method === 'GET' ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(endpoint.timeoutMs),
      });
    } catch (err) {
      throw new Error(
        `Tool '${toolId}' failed: ${endpoint.appId} unreachable at ${endpoint.baseUrl} (${err instanceof Error ? err.message : 'network error'})`,
      );
    }

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const msg =
        (data as { error?: string; message?: string } | null)?.error ??
        (data as { error?: string; message?: string } | null)?.message ??
        `HTTP ${res.status}`;
      throw new Error(`Tool '${toolId}' failed on ${endpoint.appId}: ${msg}`);
    }

    return data;
  };
}

// ---------------------------------------------------------------------------
// Param mappers: agent-facing tool schema -> target backend API shape
// ---------------------------------------------------------------------------

/** quantmail.send { to, subject, body, cc } -> POST /emails contract */
export function mapQuantMailSend(params: Record<string, unknown>): Record<string, unknown> {
  const to = String(params['to'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const cc = String(params['cc'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const body = String(params['body'] ?? '');
  return {
    toAddresses: to,
    ccAddresses: cc,
    subject: String(params['subject'] ?? ''),
    bodyPlain: body,
    bodyHtml: body ? `<p>${body.replace(/\n/g, '<br/>')}</p>` : undefined,
    send: true,
  };
}

/** quantchat.send { channelId, message, replyTo } -> POST /conversations/:id/messages contract */
export function mapQuantChatSend(params: Record<string, unknown>): Record<string, unknown> {
  const message = String(params['message'] ?? '');
  if (!message.trim()) {
    throw new Error('quantchat.send requires a non-empty message');
  }
  return {
    content: message,
    type: 'text',
    replyToId: params['replyTo'] ?? undefined,
  };
}

/** quantcalendar.create-event -> POST /events contract (stub shape, documented) */
export function mapQuantCalendarCreate(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    title: params['title'],
    description: params['description'],
    start: params['start'] ?? params['startTime'],
    end: params['end'] ?? params['endTime'],
    attendees: params['attendees'],
    // TODO(phase2): confirm field names against the real calendar backend
    // once it is deployed; this shape is a documented placeholder.
  };
}
