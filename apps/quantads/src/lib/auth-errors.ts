// ============================================================================
// QuantAds — auth-error detection.
// The backend answers unauthenticated API calls with 401
// `{ code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' }`
// (see packages/server-core/src/plugins/auth.ts). That raw message must never
// reach the user: pages use this helper to swap it for a friendly sign-in
// state instead.
// ============================================================================

interface MaybeAuthError {
  code?: unknown;
  statusCode?: unknown;
  status?: unknown;
  message?: unknown;
}

/** True when `error` represents a 401/unauthenticated backend response. */
export function isUnauthorizedError(error: unknown): boolean {
  if (!error) return false;
  const err = error as MaybeAuthError;
  if (typeof err.code === 'string' && /unauthorized/i.test(err.code)) return true;
  if (err.statusCode === 401 || err.status === 401) return true;
  const message =
    err instanceof Error
      ? err.message
      : typeof err.message === 'string'
        ? err.message
        : typeof error === 'string'
          ? error
          : '';
  return /missing or invalid authorization|unauthorized|\b401\b/i.test(message);
}
