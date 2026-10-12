import type { FastifyRequest } from 'fastify';
import type { AuthContext } from '@quant/auth';

/**
 * Account-status verdict for the opt-in auth gate (QC-F-041).
 *
 * JWT verification is stateless: a token issued to a user who has since
 * deleted or been suspended stays cryptographically valid until expiry.
 * An app that supplies an `accountStatus` resolver closes that revocation
 * gap — after the JWT verifies, the auth plugin asks the resolver for the
 * account's CURRENT status and rejects non-'ok' verdicts:
 *   - 'deleted'    → 401 ACCOUNT_DELETED (account gone / user row missing)
 *   - 'suspended'  → 401 ACCOUNT_SUSPENDED (suspended or deactivated)
 *   - 'unavailable'→ 503 UPSTREAM_UNAVAILABLE (status lookup failed;
 *                    fail-closed — a DB error never waves a token through)
 * The resolver is a DENY-list by contract: any status the app does not
 * treat as deleted/suspended must resolve to 'ok' (e.g. QuantChat phone-OTP
 * users legitimately stay in PENDING_VERIFICATION forever).
 */
export type AccountStatusVerdict = 'ok' | 'deleted' | 'suspended' | 'unavailable';

export type AccountStatusResolver = (userId: string) => Promise<AccountStatusVerdict>;

export interface AppConfig {
  port: number;
  host: string;
  logLevel: string;
  corsOrigins: string[];
  rateLimitMax: number;
  rateLimitWindow: string;
  redisUrl?: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  env: 'development' | 'production' | 'test';
  /**
   * Extra URL path rules that bypass or relax the global auth hook (in addition to
   * the built-in health/metrics paths). Use for pre-authentication endpoints
   * (e.g. login/OTP) or public read routes (e.g. GET /videos).
   * Exact matching is enforced by default to prevent prefix bypass leaks (W32-6).
   */
  publicPaths?: PublicPathEntry[];
  /**
   * Opt-in account-status gate (QC-F-041). When supplied, `requireAuth`
   * consults this resolver after JWT verification and rejects deleted /
   * suspended accounts (and fails closed when the lookup is unavailable);
   * `optionalAuth` simply withholds the identity in those cases. When
   * omitted (the default for every existing app), auth behaviour is
   * exactly the pre-QC-F-041 stateless behaviour.
   */
  accountStatus?: AccountStatusResolver;
}

export interface PublicPathRule {
  path: string;
  methods?: Array<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | string>;
  exact?: boolean;
}

export type PublicPathEntry = string | PublicPathRule;

export interface AuthenticatedRequest extends FastifyRequest {
  auth: AuthContext;
}
