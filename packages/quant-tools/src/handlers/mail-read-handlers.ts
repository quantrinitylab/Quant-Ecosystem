// ============================================================================
// Quanty mail read-only tool handlers (tier 0)
//
// REAL handler implementations for the mail read tools declared in
// `../tools/mail-tools.ts` (`quantmail.search`, `quantmail.listUnread`,
// `quantmail.getMessage`). They are registered on a {@link ToolExecutor} via
// {@link registerMailReadHandlers} so the native function-calling path can
// consume them.
//
// HOW USER SCOPING WORKS
//   Every handler runs AS THE CALLING USER. The caller's JWT is threaded
//   through `ToolExecutionContext.metadata` (see the executor's doc comment:
//   "request-scoped secrets such as the caller's JWT") and forwarded as a
//   Bearer token to the QuantMail backend's own REST API — the exact same
//   endpoints the web app calls. The backend's global auth hook verifies the
//   JWT and derives `userId` from it, so there is NO way to read another
//   user's mail through these handlers. There is no superuser path here.
//
// HONESTY GAPS (not wired yet)
//   - `quantmail.search`'s `folder` input is accepted but NOT honoured: the
//     backend `/emails/search` endpoint has no folder restriction, so a search
//     covers the whole mailbox. It is kept in the schema for forward
//     compatibility; see the handler comment.
//   - `quantmail.listUnread` filters the most recent inbox page client-side
//     (the list endpoint returns an `unreadCount` but no unread-only filter),
//     so with a very large inbox some unread mail may sit beyond the fetched
//     page. The returned `unreadCount` is the backend's own total.
//
// No confirmation UX is needed: tier 0 = read-only.
// ============================================================================

import type { ToolExecutionContext } from '../types.js';
import type { ToolExecutor, ToolHandler } from '../executor/tool-executor.js';

/** Metadata key under which the caller's JWT is threaded through the context. */
export const MAIL_JWT_METADATA_KEY = 'jwt';

/** Env override for the QuantMail API base (useful for staging/QA). */
export const QUANTMAIL_API_BASE_URL_ENV = 'QUANTMAIL_API_BASE_URL';

/** Public production endpoint. Never a localhost/dev default — production only. */
export const DEFAULT_QUANTMAIL_API_BASE_URL = 'https://quantmail.in';

/** Upper bound for one tool call (prevents an LLM loop from pulling megabytes). */
export const MAX_PAGE_SIZE = 100;

const DEFAULT_PAGE_SIZE = 20;
const BACKEND_TIMEOUT_MS = 20000;

export interface MailReadHandlerOptions {
  /**
   * QuantMail API base URL, e.g. `https://quantmail.in`. Falls back to
   * `QUANTMAIL_API_BASE_URL`, then the production default.
   */
  baseUrl?: string;
  /** Injectable fetch for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/**
 * Resolve the caller's JWT from the execution context. Throws when absent —
 * handlers MUST NOT fall back to any ambient/service credential.
 */
export function resolveCallerJwt(context: ToolExecutionContext): string {
  const jwt = context.metadata?.[MAIL_JWT_METADATA_KEY];
  if (typeof jwt !== 'string' || jwt.trim() === '') {
    throw new Error(
      `quantmail tool refused: no caller JWT in ToolExecutionContext.metadata['${MAIL_JWT_METADATA_KEY}']. ` +
        'Read-only mail tools execute as the user; without their token nothing runs.',
    );
  }
  return jwt;
}

export function resolveBaseUrl(options?: MailReadHandlerOptions): string {
  const raw =
    options?.baseUrl ?? process.env[QUANTMAIL_API_BASE_URL_ENV] ?? DEFAULT_QUANTMAIL_API_BASE_URL;
  return raw.replace(/\/+$/, '');
}

function clampLimit(value: unknown, fallback: number = DEFAULT_PAGE_SIZE): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, n));
}

function stringParam(params: Record<string, unknown>, name: string): string | undefined {
  const v = params[name];
  return typeof v === 'string' ? v : undefined;
}

interface BackendEnvelope<T> {
  success: boolean;
  data: T;
  unreadCount?: number;
  error?: { message?: string; code?: string } | string;
}

/**
 * GET the QuantMail backend as the user. Throws honest errors (no fabricated
 * data) on transport failures, non-2xx statuses, or `success: false` bodies.
 */
async function backendGet<T>(
  context: ToolExecutionContext,
  path: string,
  query: Record<string, string | number>,
  options?: MailReadHandlerOptions,
): Promise<{ data: T; unreadCount?: number }> {
  const jwt = resolveCallerJwt(context);
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;

  const url = new URL(`/api${path}`, resolveBaseUrl(options));
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
      },
      // Signal is ignored by test doubles; real fetch aborts on timeout.
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(
      `quantmail backend unreachable at ${url.origin}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    // 401/403 mean the JWT is bad/expired or the user may not see the row —
    // report it honestly, never downgrade to invented data.
    throw new Error(`quantmail backend refused the request (HTTP ${res.status}) for this user`);
  }

  let body: BackendEnvelope<T>;
  try {
    body = (await res.json()) as BackendEnvelope<T>;
  } catch {
    throw new Error('quantmail backend returned a non-JSON response');
  }

  if (body == null || body.success !== true) {
    const detail =
      typeof body?.error === 'string' ? body.error : (body?.error?.message ?? 'unknown backend error');
    throw new Error(`quantmail backend reported failure: ${detail}`);
  }

  return { data: body.data, unreadCount: body.unreadCount };
}

// ---------------------------------------------------------------------------
// Output mapping (honest subsets of the backend's formatted email record)
// ---------------------------------------------------------------------------

export interface MailSummary {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  snippet: string;
  date: string | null;
  unread: boolean;
}

function toSummary(raw: Record<string, unknown>): MailSummary {
  const from = raw['from'];
  const fromEmail =
    typeof from === 'object' && from !== null
      ? String((from as Record<string, unknown>)['email'] ?? '')
      : String(raw['fromAddress'] ?? '');
  return {
    id: String(raw['id'] ?? ''),
    subject: String(raw['subject'] ?? ''),
    from: fromEmail,
    fromName: String(raw['fromName'] ?? ''),
    snippet: String(raw['snippet'] ?? raw['bodyPlain'] ?? '').slice(0, 200),
    date: raw['receivedAt'] != null ? String(raw['receivedAt']) : null,
    unread: raw['isRead'] !== true,
  };
}

function toDetail(raw: Record<string, unknown>): Record<string, unknown> {
  const summary = toSummary(raw);
  const toAddrs = Array.isArray(raw['toAddresses']) ? raw['toAddresses'] : [];
  const ccAddrs = Array.isArray(raw['ccAddresses']) ? raw['ccAddresses'] : [];
  return {
    ...summary,
    to: toAddrs.map((a) => String(a)),
    cc: ccAddrs.map((a) => String(a)),
    bodyText: String(raw['bodyPlain'] ?? raw['bodyText'] ?? ''),
    hasAttachments: raw['hasAttachments'] === true,
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function makeHandlers(options?: MailReadHandlerOptions): Record<string, ToolHandler> {
  const search: ToolHandler = async (params, context) => {
    const query = stringParam(params, 'query')?.trim();
    if (!query) {
      throw new Error('quantmail.search requires a non-empty `query` string');
    }
    // NOT WIRED YET: `folder` — the backend /emails/search endpoint accepts no
    // folder restriction, so the search covers the user's whole mailbox. The
    // param is accepted for forward compatibility but must not be advertised
    // as filtering (that would be a fake capability).
    const limit = clampLimit(params['limit']);
    const { data } = await backendGet<Record<string, unknown>[]>(
      context,
      '/emails/search',
      { q: query, pageSize: limit },
      options,
    );
    const items = Array.isArray(data) ? data : [];
    return items.map(toSummary);
  };

  const listUnread: ToolHandler = async (params, context) => {
    const limit = clampLimit(params['limit']);
    // The list endpoint has no unread-only filter; it returns an `unreadCount`
    // alongside the page. Filter the fetched page client-side — honest about
    // the pagination caveat (documented in the module header).
    const { data, unreadCount } = await backendGet<Record<string, unknown>[]>(
      context,
      '/emails/',
      { folderType: 'INBOX', pageSize: limit },
      options,
    );
    const items = Array.isArray(data) ? data : [];
    const unread = items.filter((m) => toSummary(m).unread).map(toSummary);
    return {
      emails: unread,
      unreadCount: typeof unreadCount === 'number' ? unreadCount : unread.length,
    };
  };

  const getMessage: ToolHandler = async (params, context) => {
    const messageId = stringParam(params, 'messageId')?.trim();
    if (!messageId) {
      throw new Error('quantmail.getMessage requires a non-empty `messageId` string');
    }
    // Belt-and-braces: ids are backend-generated (cuid-ish); refuse anything
    // that could smuggle a path traversal into the URL.
    if (!/^[\w-]+$/.test(messageId)) {
      throw new Error('quantmail.getMessage refused: `messageId` has an unexpected shape');
    }
    const { data } = await backendGet<Record<string, unknown>>(
      context,
      `/emails/${encodeURIComponent(messageId)}`,
      {},
      options,
    );
    if (data == null || typeof data !== 'object') {
      throw new Error('quantmail backend returned no message for that id');
    }
    return toDetail(data);
  };

  return {
    'quantmail.search': search,
    'quantmail.listUnread': listUnread,
    'quantmail.getMessage': getMessage,
  };
}

/**
 * Register the real read-only mail handlers on a {@link ToolExecutor}.
 * Options (base URL, fetch implementation) are bound at registration time.
 */
export function registerMailReadHandlers(
  executor: ToolExecutor,
  options?: MailReadHandlerOptions,
): void {
  const handlers = makeHandlers(options);
  for (const [toolId, handler] of Object.entries(handlers)) {
    executor.registerHandler(toolId, handler);
  }
}
