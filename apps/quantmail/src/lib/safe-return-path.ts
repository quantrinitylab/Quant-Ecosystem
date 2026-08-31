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
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}

export default safeReturnPath;
