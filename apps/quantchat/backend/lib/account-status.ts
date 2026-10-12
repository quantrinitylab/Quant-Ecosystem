// ============================================================================
// QuantChat — account-status gate (QC-F-041)
// ============================================================================
//
// JWT verification (server-core auth plugin, realtime ConnectionAuth) is
// stateless: it checks signature/issuer/audience/expiry — and, since
// QC-F-030, the token `kind` — but never the account's CURRENT status.
// Before this gate existed, DELETE /settings/account only stamped
// `deletedAt` on the user row, so a deleted user's already-issued tokens
// kept working on every REST route and WebSocket connect until expiry,
// /auth/me kept returning the profile, and a phone-OTP verify minted the
// deleted account a brand-new token pair (upsertPhoneUser had no
// deletedAt filter at all).
//
// This module is QuantChat's half of the fix: a deny-list status resolver
// shared by the REST gate (wired via AppConfig.accountStatus in app.ts)
// and the WebSocket verifier (routes/websocket.ts). The plugin side is
// generic and opt-in; everything QuantChat-specific lives here:
//
//   row missing              -> 'deleted'   (a token for a user that does
//                                            not exist was never valid;
//                                            ACCOUNT_DELETED is the honest
//                                            fail-closed answer)
//   deletedAt != null        -> 'deleted'
//   status SUSPENDED         -> 'suspended'
//   status DEACTIVATED       -> 'suspended'
//   anything else            -> 'ok'        — DENY-LIST, never an ACTIVE
//                                            allow-list: phone-OTP users
//                                            stay PENDING_VERIFICATION for
//                                            their whole account life, so
//                                            requiring ACTIVE would lock
//                                            out the entire phone population.
//   lookup throws            -> 'unavailable' (callers fail closed: REST
//                                            503, WS close 4001, optional
//                                            auth withholds the identity)
//
// Cache: verdicts are cached in-process for `ttlMs` (default 30s) so the
// gate costs at most one PK lookup per user per TTL window, and a cached
// 'ok' also rides out brief DB hiccups inside the window. The honest
// trade-off, pinned by tests: revocation on OTHER instances lands within
// the TTL; the instance that serves DELETE /settings/account invalidates
// its own cache entry (see routes/settings.ts) so the deleter's tokens
// die immediately there. 'unavailable' is NEVER cached — recovery is
// immediate once the database answers again.
// ============================================================================

import type { PrismaClient } from '@prisma/client';

export type AccountStatusVerdict = 'ok' | 'deleted' | 'suspended' | 'unavailable';

export type AccountStatusResolver = (userId: string) => Promise<AccountStatusVerdict>;

export interface AccountStatusGate {
  resolver: AccountStatusResolver;
  /** Drop a cached verdict (e.g. right after this process deletes the account). */
  invalidate: (userId: string) => void;
  /** Number of cached verdicts — exposed for tests/diagnostics only. */
  cacheSize: () => number;
}

export const DEFAULT_ACCOUNT_STATUS_TTL_MS = 30_000;

interface CacheEntry {
  verdict: Exclude<AccountStatusVerdict, 'unavailable'>;
  expiresAt: number;
}

/**
 * Build the gate. `getPrisma` is a provider (not a client) because the
 * Fastify prisma decoration only exists after createApp() has run, while
 * the resolver must be handed to createApp() as part of the config; the
 * provider is only invoked at request time. A missing client resolves to
 * 'unavailable' (fail-closed), never to 'ok'.
 */
export function createAccountStatusGate(
  getPrisma: () => PrismaClient | undefined,
  options?: { ttlMs?: number; now?: () => number },
): AccountStatusGate {
  const ttlMs = options?.ttlMs ?? DEFAULT_ACCOUNT_STATUS_TTL_MS;
  const now = options?.now ?? (() => Date.now());
  const cache = new Map<string, CacheEntry>();

  const resolver: AccountStatusResolver = async (userId: string) => {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now()) {
      return cached.verdict;
    }

    let verdict: CacheEntry['verdict'];
    try {
      const prisma = getPrisma();
      if (!prisma) return 'unavailable';
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { deletedAt: true, status: true },
      });
      if (!user || user.deletedAt) {
        verdict = 'deleted';
      } else if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
        verdict = 'suspended';
      } else {
        verdict = 'ok';
      }
    } catch {
      return 'unavailable';
    }

    if (ttlMs > 0) {
      cache.set(userId, { verdict, expiresAt: now() + ttlMs });
    }
    return verdict;
  };

  return {
    resolver,
    invalidate: (userId: string) => {
      cache.delete(userId);
    },
    cacheSize: () => cache.size,
  };
}
