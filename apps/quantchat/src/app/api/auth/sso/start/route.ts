import { NextRequest, NextResponse } from 'next/server';
import {
  QUANTCHAT_OAUTH_CLIENT_ID,
  SSO_RETURN_COOKIE,
  SSO_STATE_COOKIE,
  SSO_VERIFIER_COOKIE,
  buildAuthorizeUrl,
  codeChallengeS256,
  generateCodeVerifier,
  generateState,
  publicQuantmailBase,
  safeReturnPath,
} from '../../../../../lib/sso-oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/auth/sso/start — begins the "Continue with QuantMail" OAuth2
 * code+PKCE handshake (Contract A).
 *
 * Generates the PKCE pair + CSRF state server-side, parks them in short-lived
 * HttpOnly cookies (10 min, SameSite=Lax), and returns the QuantMail
 * authorization URL for the browser to navigate to. No tokens ever touch the
 * URL; the callback route (/api/auth/sso/callback) completes the exchange.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { returnTo?: unknown } | null;
  const returnTo =
    safeReturnPath(typeof body?.returnTo === 'string' ? body.returnTo : null) ?? '/';

  try {
    const verifier = generateCodeVerifier();
    const state = generateState();
    const challenge = await codeChallengeS256(verifier);

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/auth/sso/callback`;
    const authorizeUrl = buildAuthorizeUrl({
      providerBaseUrl: publicQuantmailBase(),
      clientId: QUANTCHAT_OAUTH_CLIENT_ID,
      redirectUri,
      state,
      codeChallenge: challenge,
    });

    const response = NextResponse.json(
      { success: true, data: { authorizeUrl } },
      { headers: { 'cache-control': 'no-store' } },
    );
    const secure = request.url.startsWith('https://') || process.env.NODE_ENV === 'production';
    const cookieOpts = {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 600, // 10 minutes — matches the 5-min code TTL with headroom
    };
    response.cookies.set(SSO_STATE_COOKIE, state, cookieOpts);
    response.cookies.set(SSO_VERIFIER_COOKIE, verifier, cookieOpts);
    response.cookies.set(SSO_RETURN_COOKIE, returnTo, cookieOpts);
    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SSO_START_FAILED',
          message: 'Could not start QuantMail sign-in. Please try again.',
        },
      },
      { status: 500 },
    );
  }
}
