// ============================================================================
// @quant/api-client - Same-origin proxy fetch helper
// ============================================================================
//
// `useApiQuery` / `useApiMutation` call the app's own Next.js `app/api/*` proxy
// (a same-origin relative path such as `/api/notifications/send`). The proxy is
// the only thing that talks to a backend URL; the browser-side hooks only ever
// hit the same-origin proxy. This helper performs that same-origin request and
// normalizes the result into the standard `APIResponse<T>` envelope so the hooks
// behave consistently with the rest of the SDK (HttpClient, endpoint hooks).

import type { APIResponse, APIError } from './types';

/** HTTP methods supported by the same-origin proxy hooks. */
export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Per-call options shared by the query/mutation hooks. */
export interface ApiFetchInit {
  method?: ApiMethod;
  /** Parsed/serializable request body (objects are JSON-encoded). */
  body?: unknown;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
  /** Bearer token to attach as `Authorization` (optional; cookies also work). */
  token?: string;
  /** Query string params appended to the path (GET-style). */
  params?: Record<string, string>;
  /** AbortSignal for cancellation (wired by react-query). */
  signal?: AbortSignal;
  /** Request timeout in ms (default 30000). */
  timeout?: number;
}

/** Validate that a request path is a safe, same-origin Next.js proxy path. */
function validateProxyPath(path: string): { ok: true } | { ok: false; reason: string } {
  if (!path || !path.startsWith('/')) {
    return { ok: false, reason: 'Path must be an absolute same-origin path starting with "/"' };
  }
  if (path.startsWith('//')) {
    return { ok: false, reason: 'Protocol-relative URLs are not allowed' };
  }
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(path)) {
    return { ok: false, reason: 'Absolute URLs with a scheme are not allowed' };
  }

  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';

  let parsed: URL;
  try {
    parsed = new URL(path, baseOrigin);
  } catch {
    return { ok: false, reason: 'Path is not a valid URL path' };
  }

  if (parsed.origin !== baseOrigin) {
    return { ok: false, reason: 'Cross-origin paths are not allowed' };
  }
  if (!parsed.pathname.startsWith('/api/')) {
    return { ok: false, reason: 'Only /api/* proxy paths are allowed' };
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  for (const segment of segments) {
    const decoded = decodeURIComponent(segment);
    if (decoded === '.' || decoded === '..') {
      return { ok: false, reason: 'Path traversal segments are not allowed' };
    }
  }

  return { ok: true };
}

/** Append query params to a same-origin path without dropping existing ones. */
export function buildPath(path: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return path;
  const search = new URLSearchParams(params).toString();
  return path.includes('?') ? `${path}&${search}` : `${path}?${search}`;
}

/**
 * Perform a same-origin request to a Next.js proxy path and return the standard
 * `{ success, data, error }` envelope. Never throws for HTTP/network errors —
 * those are mapped into `APIResponse.error` so callers (react-query) get a value.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<APIResponse<T>> {
  const { method = 'GET', body, headers, token, params, signal, timeout = 30000 } = init;

  const pathValidation = validateProxyPath(path);
  if (!pathValidation.ok) {
    return {
      success: false,
      data: undefined as unknown as T,
      error: {
        code: 'INVALID_PATH',
        message: pathValidation.reason,
        statusCode: 400,
      },
    };
  }

  const url = buildPath(path, params);
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (token) finalHeaders['Authorization'] = `Bearer ${token}`;

  const requestInit: RequestInit = { method, headers: finalHeaders };
  if (body !== undefined && method !== 'GET') {
    requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  // Allow either an external signal or an internal timeout controller.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  requestInit.signal = controller.signal;

  try {
    const response = await fetch(url, requestInit);
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as Partial<APIError>;
      const apiError: APIError = {
        code: errorBody.code || 'REQUEST_FAILED',
        message: errorBody.message || response.statusText,
        statusCode: response.status,
        details: errorBody.details,
      };
      return { success: false, data: undefined as unknown as T, error: apiError };
    }

    const data = (await response.json()) as APIResponse<T>;
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        data: undefined as unknown as T,
        error: {
          code: 'TIMEOUT',
          message: `Request timed out after ${timeout}ms`,
          statusCode: 408,
        },
      };
    }
    return {
      success: false,
      data: undefined as unknown as T,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
        statusCode: 0,
      },
    };
  }
}
