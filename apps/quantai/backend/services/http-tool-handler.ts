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
import type { AppEndpoint, ToolRoute } from './app-endpoints';

export interface HttpHandlerOptions {
  endpoint: AppEndpoint;
  toolId: string;
  route: ToolRoute;
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
 * Build a ToolHandler that executes a cross-app tool over HTTP.
 * Throws when the caller's JWT is missing (fail closed) or the app errors.
 */
export function createHttpToolHandler(opts: HttpHandlerOptions): ToolHandler {
  const { endpoint, toolId, route, mapParams, extraHeaders } = opts;

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
    // Substitute :param placeholders in the route path (e.g. /emails/:id).
    // Substituted params are removed from the query/body payload.
    const remaining: Record<string, unknown> = { ...body };
    const path = route.path.replace(/:([A-Za-z0-9_]+)/g, (m, key: string) => {
      const v = remaining[key];
      if (v === undefined || v === null) return m; // leave placeholder; backend 404s honestly
      delete remaining[key];
      return encodeURIComponent(String(v));
    });
    const url =
      endpoint.baseUrl +
      path +
      (route.method === 'GET' ? toQueryString(remaining) : '');

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

/**
 * Escape HTML special chars so untrusted text (e.g. voice transcripts)
 * can be embedded in email HTML without injection.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    // QM-QUANTY-003: body is untrusted (voice transcript / agent output) —
    // escape before embedding in HTML.
    bodyHtml: body ? `<p>${escapeHtml(body).replace(/\n/g, '<br/>')}</p>` : undefined,
    send: true,
  };
}

/** quantmail.contacts.search { q } -> GET /contacts/search contract */
export function mapQuantMailContactsSearch(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return { q: String(params['q'] ?? '') };
}

/** quantmail.draft { to, subject, body } -> POST /emails (draft) contract */
export function mapQuantMailDraft(params: Record<string, unknown>): Record<string, unknown> {
  const to = String(params['to'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const body = String(params['body'] ?? '');
  return {
    toAddresses: to,
    subject: String(params['subject'] ?? ''),
    bodyPlain: body,
    // Same escaping rule as send: body is untrusted.
    bodyHtml: body ? `<p>${escapeHtml(body).replace(/\n/g, '<br/>')}</p>` : undefined,
    send: false,
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
