// ============================================================================
// QuantAI — auth proxy cookie filter (F-202)
// ============================================================================
//
// Parse a Cookie header and return a new header value containing ONLY the
// identity refresh cookie. Lives outside the route module on purpose: Next.js
// route files may only export HTTP handlers and route config — any extra
// export fails the framework's route type validation during typecheck/build.

const REFRESH_COOKIE = 'quantmail_refresh';

/**
 * Parse a Cookie header and return a new header value containing ONLY the
 * identity refresh cookie. Returns null when the refresh cookie is absent or
 * has no usable value, so callers can omit the Cookie header entirely.
 *
 * Deliberately strict: malformed pairs (no '='), empty values, and
 * case-variant lookalikes (quantmail_Refresh) are dropped rather than guessed.
 */
export const buildForwardedCookieHeader = (
  cookieHeader: string | null,
): string | null => {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name === REFRESH_COOKIE && value.length > 0) {
      return `${REFRESH_COOKIE}=${value}`;
    }
  }
  return null;
};
