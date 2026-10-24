// @vitest-environment node
// ===========================================================================
// Browser-session cookie issuance (fix/qm-quantgit-repos-401-cookie-3).
// ===========================================================================
//
// The global auth hook already accepted a `quant_access_token` cookie, but
// no session issuance ever wrote one — so cookie-only requests 401'd even
// with a valid session. These tests pin the issuance side: every browser
// session minted through issueBrowserSession must park BOTH credentials —
// the refresh cookie AND the short-lived access cookie — and logout/
// refresh-failure paths must clear both.

import { describe, it, expect, vi } from 'vitest';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearAccessCookie,
  issueBrowserSession,
  setAccessCookie,
} from '../lib/auth-session';

const stubTokenService = {
  generateTokenPair: async () => ({
    accessToken: 'acc-token-123',
    refreshToken: 'ref-token-456',
    expiresIn: 900,
    tokenType: 'Bearer',
  }),
} as never;

const stubUser = {
  id: 'user-1',
  email: 'alice@example.com',
  username: 'alice',
  displayName: 'Alice',
  role: 'user',
} as never;

function stubReply() {
  return { setCookie: vi.fn(), clearCookie: vi.fn() };
}

describe('access-cookie helpers', () => {
  it('setAccessCookie parks the access token HttpOnly + SameSite=Strict + Path=/ with the token lifetime', () => {
    const reply = stubReply();
    setAccessCookie(reply, 'tok', 900);
    expect(reply.setCookie).toHaveBeenCalledWith(ACCESS_COOKIE_NAME, 'tok', {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
      maxAge: 900,
    });
  });

  it('clearAccessCookie clears the access cookie with matching flags', () => {
    const reply = stubReply();
    clearAccessCookie(reply);
    expect(reply.clearCookie).toHaveBeenCalledWith(ACCESS_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
    });
  });
});

describe('issueBrowserSession', () => {
  it('sets BOTH the refresh cookie and the access cookie (no cookie-only 401 after login)', async () => {
    const reply = stubReply();
    const session = await issueBrowserSession(stubTokenService, reply, stubUser);

    expect(session.data.accessToken).toBe('acc-token-123');
    const setCalls = reply.setCookie.mock.calls;
    const byName = new Map(setCalls.map(([name, value, opts]) => [name, { value, opts }]));

    expect(byName.get(REFRESH_COOKIE_NAME)?.value).toBe('ref-token-456');
    expect(byName.get(ACCESS_COOKIE_NAME)?.value).toBe('acc-token-123');
    // The access cookie must not outlive the access token it carries.
    expect(byName.get(ACCESS_COOKIE_NAME)?.opts).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 900,
    });
  });
});
