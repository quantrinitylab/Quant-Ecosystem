// ============================================================================
// QuantChat - Post-login return target (deep-link preservation)
// ============================================================================
//
// QC-F-049: a logged-out visitor who followed a deep link (push-notification
// click via public/sw.js openWindow, a QuantMail / cross-app handoff, or a
// shared /chat/<id> link) was bounced by the auth gate to a bare /login, and
// every login success path then navigated to a hardcoded '/'. The intended
// destination was destroyed at the gate, so the whole notification-deeplink
// system (src/lib/notification-deeplink.ts) dead-ended on the chat list.
//
// The contract restored here:
//   gate (logged out, app route)  -> /login?returnTo=<encoded target>
//   login success (password form)  -> the validated returnTo, else '/'
//   login page opened while authed -> the validated returnTo, else '/'
//   SSO exchange success           -> unchanged: it already resolves the
//                                     returnTo through the cross-app bridge
//                                     validator (which also permits
//                                     allowlisted ecosystem origins).
//
// SAFETY: a returnTo is an open-redirect surface (CWE-601), so values are
// accepted ONLY when they are internal paths (single leading '/', no
// protocol-relative '//', no backslashes, no scheme) whose pathname the
// route registry classifies as a real app route. Anything else — absolute
// URLs, '/login' itself, unknown paths, malformed values — resolves to
// null here and to '/' at navigation time. Callers pass values that are
// already URL-decoded exactly once (URLSearchParams.get semantics); this
// module never decodes again, so double-encoded payloads stay inert data
// inside the path and fail the registry check instead of unwrapping.

import { classifyPath } from './route-access';

/** Split a candidate path into its pathname and the suffix (?query / #hash). */
function splitCandidate(candidate: string): { pathname: string; suffix: string } {
  const cut = candidate.search(/[?#]/);
  if (cut === -1) return { pathname: candidate, suffix: '' };
  return { pathname: candidate.slice(0, cut), suffix: candidate.slice(cut) };
}

/**
 * Validate a candidate post-login target. Returns the candidate unchanged
 * when it is a safe internal app-route path, otherwise null.
 */
export function sanitizeInternalReturnPath(
  candidate: string | null | undefined,
): string | null {
  if (!candidate || typeof candidate !== 'string') return null;
  const value = candidate.trim();
  if (!value) return null;
  // Internal paths only: exactly one leading slash. '//' is a
  // protocol-relative URL, and a backslash anywhere can be normalised into
  // one by some URL parsers — both are open-redirect classics.
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  // No whitespace or control characters anywhere in the target.
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return null;

  const { pathname } = splitCandidate(value);
  // The registry is the single source of truth for real routes: public
  // paths (including '/login' — a loop) and unknown paths are not valid
  // post-login targets.
  if (classifyPath(pathname) !== 'app') return null;
  return value;
}

/**
 * Build the gate's redirect for a logged-out visitor on an app route.
 * `suffix` is everything after the pathname in the current URL ('?query'
 * and/or '#hash', as read by the router shell). The destination survives
 * as a single encoded `returnTo` parameter. The BARE app root needs no
 * parameter because '/' is already the post-login default — but a root
 * WITH a suffix ('/?view=inbox&lens=snoozed') carries real app state in
 * its query/hash and must round-trip like any other deep link; dropping
 * it silently erases the visitor's destination (PR #961 review).
 */
export function buildLoginRedirect(
  pathname: string | null,
  suffix?: string | null,
): string {
  if (!pathname) return '/login';
  const candidate = suffix ? pathname + suffix : pathname;
  if (candidate === '/') return '/login';
  const safe = sanitizeInternalReturnPath(candidate);
  if (!safe) return '/login';
  return `/login?returnTo=${encodeURIComponent(safe)}`;
}

/**
 * Resolve the `returnTo` parameter on /login to the path a successful
 * sign-in should navigate to. Invalid or absent values fall back to '/'.
 */
export function resolveReturnTo(raw: string | null | undefined): string {
  return sanitizeInternalReturnPath(raw) ?? '/';
}
