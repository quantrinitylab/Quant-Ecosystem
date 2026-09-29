import { NextResponse } from 'next/server';

export async function GET() {
  const issuer = process.env['QUANTMAIL_ISSUER'] || 'https://quantmail.in';
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/sso`,
      token_endpoint: `${issuer}/api/oauth/token`,
      userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
      jwks_uri: `${issuer}/api/oauth/jwks`,
      response_types_supported: ['code', 'token', 'id_token', 'code token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256', 'HS256'],
      scopes_supported: ['openid', 'profile', 'email', 'phone', 'offline_access'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      claims_supported: [
        'sub',
        'iss',
        'aud',
        'exp',
        'email',
        'name',
        'phone_number',
        'phone_number_verified',
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
