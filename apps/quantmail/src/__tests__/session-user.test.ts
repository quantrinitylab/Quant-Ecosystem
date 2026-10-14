// @vitest-environment node

// QuantMail auth hydration: the session responses (/auth/refresh, /auth/login,
// /auth/2fa/verify) embed the user profile so the browser hydrates in ONE
// round trip instead of refresh-then-/oauth/userinfo. These tests pin the
// decision logic: embedded profile wins, and only a response without one may
// spend the second round trip.
import { describe, expect, it, vi } from 'vitest';
import { resolveSessionUser, sessionUserFromData } from '../services/session-user';
import type { BrowserAccessSession } from '../services/browser-auth-session';

const embedded = (
  user: BrowserAccessSession['user'],
): BrowserAccessSession => ({ accessToken: 'access-token', expiresIn: 900, user });

describe('sessionUserFromData', () => {
  it('normalizes a full embedded profile into an AuthUser', () => {
    expect(
      sessionUserFromData(
        embedded({
          id: 'user-1',
          email: 'user@quantmail.in',
          username: 'user',
          displayName: 'User One',
          role: 'ADMIN',
        }),
      ),
    ).toEqual({
      id: 'user-1',
      email: 'user@quantmail.in',
      username: 'user',
      displayName: 'User One',
      role: 'ADMIN',
    });
  });

  it('falls back to username when displayName is blank and to USER when role is missing', () => {
    expect(
      sessionUserFromData(embedded({ id: 'u', email: 'e@x.in', username: 'u', displayName: '  ' })),
    ).toMatchObject({ displayName: 'u', role: 'USER' });
  });

  it('returns null for older backends that embed no user', () => {
    expect(sessionUserFromData(undefined)).toBeNull();
    expect(sessionUserFromData(null)).toBeNull();
    expect(sessionUserFromData({ accessToken: 't', expiresIn: 900 })).toBeNull();
    expect(sessionUserFromData({ accessToken: 't', expiresIn: 900, user: null })).toBeNull();
  });

  it('returns null for a malformed embedded user instead of inventing one', () => {
    expect(sessionUserFromData(embedded({ id: '', email: 'e@x.in', username: 'u' }))).toBeNull();
    expect(sessionUserFromData(embedded({ id: 'u', email: '', username: 'u' }))).toBeNull();
  });
});

describe('resolveSessionUser', () => {
  it('uses the embedded profile and NEVER calls fetchProfile (one round trip)', async () => {
    const fetchProfile = vi.fn();
    const user = await resolveSessionUser(
      embedded({ id: 'u', email: 'e@x.in', username: 'u', displayName: 'U', role: 'USER' }),
      fetchProfile,
    );
    expect(user).toMatchObject({ id: 'u', displayName: 'U' });
    // This assertion is the regression test for the waterfall: the second
    // /oauth/userinfo round trip must not happen when the session carried the
    // profile.
    expect(fetchProfile).not.toHaveBeenCalled();
  });

  it('falls back to /oauth/userinfo only when the session embeds no profile', async () => {
    const fallback = { id: 'u', email: 'e@x.in', username: 'u', displayName: 'U', role: 'USER' };
    const fetchProfile = vi.fn().mockResolvedValue(fallback);
    await expect(
      resolveSessionUser({ accessToken: 't', expiresIn: 900 }, fetchProfile),
    ).resolves.toBe(fallback);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('propagates a profile-fetch failure instead of hiding it', async () => {
    const fetchProfile = vi.fn().mockRejectedValue(new Error('Could not load your profile.'));
    await expect(
      resolveSessionUser({ accessToken: 't', expiresIn: 900 }, fetchProfile),
    ).rejects.toThrow('Could not load your profile.');
  });
});
