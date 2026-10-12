// ============================================================================
// QuantAI — Cookie header parsing
// ============================================================================
//
// Exact-name parsing of the raw `Cookie` request header (RFC 6265 §5.4).
//
// Why not `header.includes('name=')`: a substring match is bypassable. A cookie
// named `xquantmail_refresh` (or any name *containing* the substring) passes an
// includes() check, misclassifying session state — e.g. the auth /refresh
// NO_SESSION fast-path would proxy a doomed refresh upstream instead of
// answering locally. Cookie identity is the *name*, so parse pairs and compare
// names exactly.

export function parseCookieHeader(header: string): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    const name = (eq === -1 ? pair : pair.slice(0, eq)).trim();
    if (!name) continue;
    if (cookies.has(name)) continue; // first occurrence wins; presence is what matters
    const value = eq === -1 ? '' : pair.slice(eq + 1).trim();
    cookies.set(name, value);
  }
  return cookies;
}

/** True when the raw Cookie header carries a cookie with exactly this name. */
export function hasCookie(header: string | null | undefined, name: string): boolean {
  if (!header || !name) return false;
  return parseCookieHeader(header).has(name);
}
