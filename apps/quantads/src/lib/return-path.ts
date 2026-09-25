// ============================================================================
// QuantAds — sign-in routing and return-path safety.
//
// `/login` is the canonical sign-in route everywhere else in the ecosystem, but
// QuantAds only ever served `/auth/login`, so https://quantads.quantrinity.in/login
// answered 404 while the app itself was up. `/login` is now the real route and
// `/auth/login` permanently redirects to it (see next.config.mjs), so existing
// links keep working.
//
// `returnTo` arrives from the query string, so it is attacker-controllable. It
// is validated and dropped when it fails, never "repaired": a value that is not
// a plain same-origin absolute path sends the visitor to the app root instead of
// to someone else's domain.
// ============================================================================

/** Canonical sign-in route. `/auth/login` permanently redirects here. */
export const LOGIN_PATH = '/login';

/** Legacy sign-in route, kept reachable so the redirect hop is never gated. */
export const LEGACY_LOGIN_PATH = '/auth/login';

/** Where a signed-in visitor lands when there is no usable `returnTo`. */
export const DEFAULT_RETURN_PATH = '/';

/** Routes a signed-out visitor is allowed to render. */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([LOGIN_PATH, LEGACY_LOGIN_PATH]);

/**
 * CR, LF, NUL and friends can smuggle a second value past a parser that is more
 * forgiving than this one, so reject them outright rather than stripping them.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === undefined) continue;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Accept only a same-origin, absolute path; return null for everything else.
 *
 * Rejected, and why:
 *  - `https://evil.tld` — an absolute URL, and not this origin.
 *  - `//evil.tld`       — protocol-relative, which the browser treats as absolute.
 *  - `/\evil.tld`       — browsers normalise the backslash to `/`, making it `//evil.tld`.
 *  - `/login`           — bouncing back to sign-in loops forever.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (hasControlCharacter(value)) return null;
  const pathOnly = value.replace(/[?#][\s\S]*$/, '');
  if (PUBLIC_PATHS.has(pathOnly)) return null;
  return value;
}

/** Build the sign-in URL a guard should send an unauthenticated visitor to. */
export function loginHref(returnTo: string | null | undefined): string {
  const safe = safeReturnPath(returnTo);
  return safe ? `${LOGIN_PATH}?returnTo=${encodeURIComponent(safe)}` : LOGIN_PATH;
}
