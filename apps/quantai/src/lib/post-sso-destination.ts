import { UniversalSSOTokenBridge } from '@quant/shared-ui';

/**
 * Resolve the post-SSO redirect target from a raw `returnTo` query value.
 *
 * Root-cause fix for F-207: `decodeURIComponent` throws `URIError` on a
 * malformed percent-escape (e.g. `?returnTo=%` or `?returnTo=%zz`). The login
 * page previously called it bare inside a catch-all effect, so one bad
 * character skipped `router.replace(...)` entirely and stranded the user on
 * `/login` despite holding a valid SSO session.
 *
 * This resolver never throws and never strands: any failure — missing value,
 * malformed encoding, blank result, or an unsafe/open-redirect target —
 * resolves to the caller-supplied `fallback` (an honest destination the page
 * already computed).
 */
export function resolvePostSsoDestination(
  rawReturn: string | null | undefined,
  fallback: string,
): string {
  if (!rawReturn) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawReturn);
  } catch {
    // Malformed percent-encoding — never let a URIError abort the redirect.
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[login] malformed returnTo ignored; falling back to', fallback);
    }
    return fallback;
  }

  if (!decoded.trim()) return fallback;

  const validation = UniversalSSOTokenBridge.validateSafeReturnPath(decoded);
  if (!validation.isSafe || !validation.sanitizedUrl) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[login] unsafe returnTo ignored; falling back to', fallback);
    }
    return fallback;
  }

  // Never bounce the user back into the login page itself.
  if (validation.sanitizedUrl === '/login') return fallback;

  return validation.sanitizedUrl;
}
