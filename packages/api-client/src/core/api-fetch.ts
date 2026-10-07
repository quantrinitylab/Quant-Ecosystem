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
  headers?: Record<string, string> | Headers;
  /** Bearer token to attach as `Authorization` (optional; cookies also work). */
  token?: string;
  /** Query string params appended to the path (GET-style). */
  params?: Record<string, string>;
  /** AbortSignal for cancellation (wired by react-query). */
  signal?: AbortSignal;
  /** Request timeout in ms (default 30000). */
  timeout?: number;
}

/**
 * Per-call options for {@link apiFetchRaw}, the native-`Response` variant.
 *
 * Accepts the same shaping options as {@link ApiFetchInit} plus passthrough of
 * the native `RequestInit` fields a behavior-preserving migration needs
 * (`credentials`, `cache`, `mode`, `redirect`, ...). Unlike `apiFetch` the raw
 * variant preserves native fetch semantics: no default timeout and no
 * envelope normalization — the caller gets the real `Response`.
 */
export interface ApiFetchRawInit {
  method?: ApiMethod;
  /**
   * Request body. Plain objects/arrays are JSON-encoded (with a JSON content
   * type unless the caller set one); strings, FormData, URLSearchParams,
   * Blob/File, ArrayBuffer(view)s and streams pass through untouched.
   */
  body?: unknown;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string> | Headers;
  /** Bearer token to attach as `Authorization` (optional; cookies also work). */
  token?: string;
  /** Query string params appended to the path (GET-style). */
  params?: Record<string, string>;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /**
   * Request timeout in ms. The raw variant keeps native fetch semantics:
   * no timeout unless explicitly set. Pass a positive number to enable.
   */
  timeout?: number;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  mode?: RequestMode;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  integrity?: string;
  keepalive?: boolean;
}

/** Validate that a request path is a safe same-origin path (no backend URLs). */
function validateSameOriginPath(path: string): { ok: true } | { ok: false; reason: string } {
  if (!path || !path.startsWith('/')) {
    return { ok: false, reason: 'Path must be an absolute same-origin path starting with "/"' };
  }
  if (path.startsWith('//')) {
    return { ok: false, reason: 'Protocol-relative URLs are not allowed' };
  }
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(path)) {
    return { ok: false, reason: 'Absolute URLs with a scheme are not allowed' };
  }

  // Check the RAW path for traversal segments BEFORE URL parsing normalizes
  // `/api/../secret` into `/secret` (which would hide the traversal).
  const rawSegments = path.split('?')[0]!.split('#')[0]!.split('/').filter(Boolean);
  for (const segment of rawSegments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return { ok: false, reason: 'Path is not a valid URL path' };
    }
    if (decoded === '.' || decoded === '..') {
      return { ok: false, reason: 'Path traversal segments are not allowed' };
    }
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

  return { ok: true };
}

/** Validate that a request path is a safe, same-origin Next.js proxy path. */
function validateProxyPath(path: string): { ok: true } | { ok: false; reason: string } {
  const sameOrigin = validateSameOriginPath(path);
  if (!sameOrigin.ok) return sameOrigin;

  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const parsed = new URL(path, baseOrigin);
  if (!parsed.pathname.startsWith('/api/')) {
    return { ok: false, reason: 'Only /api/* proxy paths are allowed' };
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
    ...normalizeHeaders(headers),
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

    const data = await parseSuccessBody<T>(response);
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

/**
 * Parse a 2xx response body into the standard `APIResponse<T>` envelope.
 *
 * Routes that already return the `{ success, data, error }` envelope pass
 * through untouched. Plain (non-enveloped) JSON bodies are wrapped as
 * `{ success: true, data: <body> }` so `apiFetch` is a behavior-preserving
 * drop-in for `fetch` + `response.json()` call sites.
 */
function normalizeEnvelope<T>(parsed: unknown): APIResponse<T> {
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'success' in parsed
  ) {
    return parsed as APIResponse<T>;
  }
  return { success: true, data: parsed as T };
}

async function parseSuccessBody<T>(response: Response): Promise<APIResponse<T>> {
  const text = await response.text();
  if (!text) {
    // 204 No Content and other empty 2xx bodies.
    return { success: true, data: undefined as unknown as T };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      success: false,
      data: undefined as unknown as T,
      error: {
        code: 'INVALID_RESPONSE',
        message: 'Response was not valid JSON',
        statusCode: response.status,
      },
    };
  }
  return normalizeEnvelope<T>(parsed);
}

/** True for JSON-encodable plain objects and arrays (not class instances). */
function isJsonEncodable(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Normalize `Record<string,string> | Headers | undefined` to a record. */
function normalizeHeaders(headers?: Record<string, string> | Headers): Record<string, string> {
  if (!headers) return {};
  if (typeof (headers as Headers).forEach === 'function') {
    const out: Record<string, string> = {};
    (headers as Headers).forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  return { ...(headers as Record<string, string>) };
}

function hasContentType(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
}

/**
 * Encode a request body for the raw variant. Plain objects/arrays are
 * JSON-encoded; strings, FormData, URLSearchParams, Blob/File,
 * ArrayBuffer(view)s and streams pass through untouched — native fetch
 * semantics, so a mechanical `fetch(` -> `apiFetchRaw(` swap preserves
 * behavior even when the caller pre-stringified the body.
 */
function encodeRawBody(body: unknown): { body: BodyInit | undefined; isJson: boolean } {
  if (body === undefined || body === null) return { body: undefined, isJson: false };
  if (typeof body === 'string') return { body, isJson: false };
  if (isJsonEncodable(body)) return { body: JSON.stringify(body), isJson: true };
  return { body: body as BodyInit, isJson: false };
}

/**
 * Same-origin request returning the native `Response` — the migration path
 * for inline `fetch()` call sites that need the raw response (status codes,
 * headers, streaming bodies, text/blob payloads, non-`/api/*` same-origin
 * routes such as `/auth/*`).
 *
 * Backend URLs are rejected: like `apiFetch`, this helper only ever talks to
 * the app's own origin. The app's Next.js proxy routes remain the only thing
 * that fetches a backend URL.
 *
 * Semantics deliberately mirror the native `fetch` so the swap is
 * behavior-preserving: no default timeout, no envelope normalization, and
 * passthrough of `credentials`, `cache`, `mode`, `redirect`, `referrer`,
 * `integrity` and `keepalive`.
 */
export async function apiFetchRaw(path: string, init: ApiFetchRawInit = {}): Promise<Response> {
  const validation = validateSameOriginPath(path);
  if (!validation.ok) {
    throw new TypeError(`apiFetchRaw: ${validation.reason} (got ${JSON.stringify(path)})`);
  }

  const {
    method = 'GET',
    body,
    headers,
    token,
    params,
    signal,
    timeout = 0,
    credentials,
    cache,
    mode,
    redirect,
    referrer,
    referrerPolicy,
    integrity,
    keepalive,
  } = init;

  const url = buildPath(path, params);
  const { body: encodedBody, isJson } = encodeRawBody(body);

  const finalHeaders = normalizeHeaders(headers);
  // Default JSON content type only when we JSON-encoded the body ourselves and
  // the caller did not set one — a pre-stringified or FormData body keeps the
  // caller's (or no) content type, exactly like native fetch.
  if (isJson && !hasContentType(finalHeaders)) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (token) finalHeaders['Authorization'] = `Bearer ${token}`;

  const requestInit: RequestInit = { method, headers: finalHeaders };
  if (encodedBody !== undefined && method !== 'GET' && (method as string) !== 'HEAD') {
    requestInit.body = encodedBody;
  }
  if (credentials !== undefined) requestInit.credentials = credentials;
  if (cache !== undefined) requestInit.cache = cache;
  if (mode !== undefined) requestInit.mode = mode;
  if (redirect !== undefined) requestInit.redirect = redirect;
  if (referrer !== undefined) requestInit.referrer = referrer;
  if (referrerPolicy !== undefined) requestInit.referrerPolicy = referrerPolicy;
  if (integrity !== undefined) requestInit.integrity = integrity;
  if (keepalive !== undefined) requestInit.keepalive = keepalive;

  // Native fetch has no timeout; only arm one when explicitly requested.
  if (timeout > 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    requestInit.signal = controller.signal;
    try {
      return await fetch(url, requestInit);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (signal) requestInit.signal = signal;
  return fetch(url, requestInit);
}
