import { NextResponse } from 'next/server';

export async function GET() {
  // NOTE: this public discovery document must stay in sync with the backend's
  // own discovery at backend/routes/oauth.ts (GET /.well-known/openid-configuration).
  // Only advertise what the backend actually issues: no phone scopes/claims
  // (phone login/OTP was removed from the product), code-only flow, RS256 only.
  const issuer = process.env['QUANTMAIL_ISSUER'] || 'https://quantmail.in';
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/sso`,
      token_endpoint: `${issuer}/api/oauth/token`,
      userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
      jwks_uri: `${issuer}/api/oauth/jwks`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      claims_supported: [
        'sub',
        'iss',
        'aud',
        'exp',
        'iat',
        'auth_time',
        'nonce',
        'email',
        'email_verified',
        'name',
        'preferred_username',
      ],
      code_challenge_methods_supported: ['S256', 'plain'],
    },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}
