/**
 * Where a sign-in is allowed to land.
 *
 * `returnTo` travels in the URL: `AuthGuard` puts the path you were denied into
 * it, and the invite page puts the invitation you were following. Both then get
 * handed to `router.push`, which follows an absolute URL as readily as a path.
 * So without a guard, `quantmail.in/login?returnTo=https://look-alike.example`
 * hands someone who has just typed their password to another origin at the exact
 * moment they expect to arrive somewhere trusted — a link that is
 * indistinguishable from a legitimate one because the host really is ours.
 *
 * Only in-app paths pass. The two forms worth naming are `//host` and `/\host`:
 * both read as a path and both resolve as an origin.
 */
const ALLOWED_EXACT_HOSTNAMES = new Set([
  'quantmail.in',
  'quantrinity.in',
  'quanttrinity.in',
  'quant.network',
  'localhost',
  '127.0.0.1',
]);

function isAllowedEcosystemHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_EXACT_HOSTNAMES.has(host)) return true;
  if (
    host.endsWith('.quantrinity.in') ||
    host.endsWith('.quanttrinity.in') ||
    host.endsWith('.quantmail.in') ||
    host.endsWith('.quant.network')
  ) {
    return true;
  }
  return false;
}

export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;

  // 1. Relative path check
  if (value.startsWith('/')) {
    if (value.startsWith('//') || value.startsWith('/\\')) return null;
    return value;
  }

  // 2. Absolute URL check for trusted ecosystem services
  try {
    const url = new URL(value);
    const isHttps = url.protocol === 'https:';
    const isLocalHttp =
      url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

    if (!isHttps && !isLocalHttp) return null;

    if (isAllowedEcosystemHost(url.hostname)) {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export default safeReturnPath;
