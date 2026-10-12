// ============================================================================
// QuantAI — QuantMail opaque-ticket SSO client (browser side).
// ============================================================================
//
// The QuantMail /sso chooser redirects back with ONLY `?__quant_sso_ticket=`.
// That ticket is opaque to the browser: it can never validate as an access
// token, so we must NOT hand it to UniversalSSOTokenBridge.consumeHandoffTicket
// (which bearer-verifies). Instead we POST it to our own backend
// (POST /api/auth/sso/ticket), which resolves it server-to-server with the
// identity root and mints a QuantAI SSO session.
//
// Legacy `?token=` / `?accessToken=` handoffs from apps that have not migrated
// keep flowing through the shared bridge; this module only handles
// `__quant_sso_ticket`.

import { scrubSsoHandoffParams } from './sso-url-params';

export interface SsoTicketUser {
  id: string;
  email: string;
  username?: string;
  displayName?: string;
  name?: string;
}

export interface SsoTicketResult {
  user: SsoTicketUser;
  sessionToken: string;
}

/** Error codes this module can surface, mapped to honest user-facing copy. */
export const SSO_TICKET_ERROR_COPY: Record<string, { message: string; retryable: boolean }> = {
  SSO_TICKET_INVALID: {
    message:
      'This QuantMail sign-in link has expired or was already used. Choose "Continue with Quant Account" again to get a fresh link.',
    retryable: false,
  },
  SSO_IDENTITY_INVALID: {
    message: 'The sign-in service returned an incomplete identity. Please try signing in again.',
    retryable: false,
  },
  SSO_CLIENT_MISCONFIGURED: {
    message:
      'Single sign-on is not configured for QuantAI yet. You can still sign in with your email and password below.',
    retryable: false,
  },
  SSO_IDENTITY_UNAVAILABLE: {
    message:
      'The QuantMail sign-in service is temporarily unreachable. Check your connection and try again.',
    retryable: true,
  },
  SSO_FAILED: {
    message: 'Sign-in via QuantMail failed. Please try again.',
    retryable: true,
  },
};

export class SsoTicketError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string) {
    const copy = SSO_TICKET_ERROR_COPY[code] ?? SSO_TICKET_ERROR_COPY['SSO_FAILED'];
    super(copy?.message ?? 'Sign-in via QuantMail failed. Please try again.');
    this.name = 'SsoTicketError';
    this.code = code;
    this.retryable = copy?.retryable ?? true;
  }
}

/** Read the opaque SSO ticket from a query string. Null when absent/empty. */
export function extractSsoTicket(search: string): string | null {
  try {
    const params = new URLSearchParams(search);
    const ticket = params.get('__quant_sso_ticket');
    return ticket && ticket.trim() ? ticket.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Scrub every SSO handoff param from the address bar without a reload, so the
 * single-use ticket never lingers in history. Done regardless of the exchange
 * outcome — call it before POSTing the ticket.
 */
export function scrubSsoTicketFromAddressBar(): void {
  try {
    const url = new URL(window.location.href);
    scrubSsoHandoffParams(url);
    const clean = url.pathname + (url.search ? url.search : '') + url.hash;
    window.history.replaceState({}, document.title, clean);
  } catch {
    // Sandboxed iframe / restricted history — non-fatal.
  }
}

// Single-flight guard: SSO tickets are single-use and React StrictMode (plus
// the AuthProvider + login page effects firing together) can otherwise burn
// the ticket with a duplicate POST. Concurrent resolutions of the same ticket
// share one promise; settled entries are dropped so the map cannot grow.
const inflightResolutions = new Map<string, Promise<SsoTicketResult>>();

async function postTicket(ticket: string, timeoutMs: number): Promise<SsoTicketResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('/api/auth/sso/ticket', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket }),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    // A fetch abort (timeout) rejects with a DOMException named 'AbortError',
    // which is NOT an instanceof Error — check the name property directly.
    const name =
      err instanceof Error
        ? err.name
        : typeof err === 'object' && err !== null
          ? (err as { name?: unknown }).name
          : undefined;
    throw new SsoTicketError(name === 'AbortError' ? 'SSO_IDENTITY_UNAVAILABLE' : 'SSO_FAILED');
  } finally {
    clearTimeout(timer);
  }

  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: { user?: SsoTicketUser; sessionToken?: string };
    error?: { code?: string };
  } | null;

  if (!res.ok || !json?.success || !json.data?.sessionToken || !json.data?.user?.id) {
    const code =
      json?.error?.code && SSO_TICKET_ERROR_COPY[json.error.code]
        ? json.error.code
        : res.status === 401
          ? 'SSO_TICKET_INVALID'
          : res.status >= 500
            ? 'SSO_IDENTITY_UNAVAILABLE'
            : 'SSO_FAILED';
    throw new SsoTicketError(code);
  }
  return { user: json.data.user, sessionToken: json.data.sessionToken };
}

/**
 * Exchange an opaque SSO ticket for a QuantAI session. Safe to call from
 * multiple effects at once — concurrent calls for the same ticket share one
 * network request.
 */
export function resolveSsoTicket(ticket: string, timeoutMs = 15000): Promise<SsoTicketResult> {
  const existing = inflightResolutions.get(ticket);
  if (existing) return existing;
  const pending = postTicket(ticket, timeoutMs).finally(() => {
    if (inflightResolutions.get(ticket) === pending) inflightResolutions.delete(ticket);
  });
  inflightResolutions.set(ticket, pending);
  return pending;
}
