import { NextRequest, NextResponse } from 'next/server';

/**
 * Owner-tier API gate. Only protects /api routes. In production this validates
 * a JWT carrying the OWNER role; here it requires a non-empty owner token or a
 * JWT-shaped bearer.
 */
export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('Authorization');
  const ownerToken = request.cookies.get('owner_token')?.value;
  const token = authHeader?.replace('Bearer ', '') || ownerToken;

  if (!token) {
    return NextResponse.json(
      { success: false, error: { message: 'Owner authentication required', code: 'UNAUTHORIZED' } },
      { status: 401 },
    );
  }

  const ownerSecret = process.env.OWNER_SECRET || 'owner-secret-key';
  if (token !== ownerSecret && !token.startsWith('eyJ')) {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid owner credentials', code: 'FORBIDDEN' } },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
