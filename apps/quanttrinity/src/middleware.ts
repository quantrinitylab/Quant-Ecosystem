import { NextRequest, NextResponse } from 'next/server';

/**
 * Constant-time string comparison. Avoids leaking the owner secret through
 * early-exit timing differences. Runs in the edge runtime (no Node crypto).
 * The length check leaks only the secret's length, which is acceptable.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Owner-tier API gate. Only protects /api routes. Access requires the bearer
 * token (Authorization header or `owner_token` cookie) to match the configured
 * OWNER_SECRET exactly, compared in constant time. A missing OWNER_SECRET fails
 * closed (503). There is no JWT-shape acceptance: a string merely *looking*
 * like a JWT (`eyJ...`) is not a credential and must be rejected.
 */
/**
 * The container's liveness/readiness endpoint. It must stay reachable without a
 * credential: this gate used to cover it, so Kubernetes probed `/api/health`,
 * got 401, failed the liveness check, and SIGTERMed the pod. Next.js shut down
 * gracefully, so the container reported `Completed` with exit code 0 and the
 * restart loop looked like a clean exit rather than a failure — ~300 restarts
 * over 18h with no error in the logs.
 *
 * Exempting it costs nothing: `/api/health` returns a static
 * `{ status, service }` and reads no request data, no database and no secret.
 * Every other `/api/*` path stays owner-gated.
 */
const PUBLIC_API_PATHS = new Set(['/api/health']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('Authorization');
  const ownerToken = request.cookies.get('owner_token')?.value;
  const token = authHeader?.replace('Bearer ', '') || ownerToken;

  if (!token) {
    return NextResponse.json(
      { success: false, error: { message: 'Owner authentication required', code: 'UNAUTHORIZED' } },
      { status: 401 },
    );
  }

  const ownerSecret = process.env.OWNER_SECRET;
  // Fail closed: never fall back to a hardcoded default secret. A missing
  // OWNER_SECRET must DENY access, not silently accept a well-known value.
  if (!ownerSecret) {
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Owner authentication is not configured', code: 'SERVICE_UNAVAILABLE' },
      },
      { status: 503 },
    );
  }

  // The only credential is the configured OWNER_SECRET. Previously a token
  // starting with `eyJ` (JWT-shaped) was accepted without verifying its
  // signature — a trivial auth bypass, since anyone could craft such a string.
  // Until a real JWS/JWKS-verified owner token flow exists, require an exact
  // constant-time match and reject everything else.
  if (!timingSafeEqual(token, ownerSecret)) {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid owner credentials', code: 'FORBIDDEN' } },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
