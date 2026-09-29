import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectUri = searchParams.get('redirect_uri');
  const clientId = searchParams.get('client_id');

  if (!redirectUri || !clientId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const targetUrl = new URL('/sso', request.url);

  // Forward all params, map redirect_uri to returnTo
  searchParams.forEach((value, key) => {
    if (key === 'redirect_uri') {
      targetUrl.searchParams.set('returnTo', value);
    } else {
      targetUrl.searchParams.set(key, value);
    }
  });

  return NextResponse.redirect(targetUrl, 302);
}
