import type { AuthUser } from '../providers/auth-provider';
import type { BrowserAccessSession } from './browser-auth-session';

/**
 * Normalize the profile a session response embeds into an AuthUser. Returns
 * null when the response carries no usable profile (older backend), so the
 * caller falls back to /oauth/userinfo. Pure and unit-tested.
 */
export function sessionUserFromData(
  data: BrowserAccessSession | undefined | null,
): AuthUser | null {
  const embedded = data?.user;
  if (!embedded || !embedded.id || !embedded.email || !embedded.username) return null;
  return {
    id: embedded.id,
    email: embedded.email,
    username: embedded.username,
    displayName: embedded.displayName?.trim() ? embedded.displayName : embedded.username,
    role: embedded.role ?? 'USER',
  };
}

/**
 * One hydration decision for page load, login, and 2FA completion: prefer the
 * profile the session response already carries (one round trip total); only
 * when the backend did not embed one do we spend the second /oauth/userinfo
 * round trip.
 */
export async function resolveSessionUser(
  data: BrowserAccessSession | undefined,
  fetchProfile: () => Promise<AuthUser>,
): Promise<AuthUser> {
  return sessionUserFromData(data) ?? (await fetchProfile());
}
