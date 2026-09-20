import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, forwardAuthRequest } from '../_lib/forward-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Exact allowlist: this route can never become a general auth proxy. */
const AUTH_ACTIONS = new Set(['login', 'register', 'refresh', 'logout']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  if (!AUTH_ACTIONS.has(action)) {
    return authErrorResponse(404, 'AUTH_ACTION_NOT_FOUND', 'Authentication action not found.');
  }

  // No refresh credential is a normal signed-out state, not a backend failure.
  if (action === 'refresh') {
    const hasRefreshCookie = (request.headers.get('cookie') ?? '')
      .split(';')
      .some((part) => part.trim().startsWith('quantmail_refresh='));
    if (!hasRefreshCookie) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session.', statusCode: 200 },
        },
        { status: 200, headers: { 'cache-control': 'no-store' } },
      );
    }
  }

  return forwardAuthRequest(request, `/auth/${action}`);
}
