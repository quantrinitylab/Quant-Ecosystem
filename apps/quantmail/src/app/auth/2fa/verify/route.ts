import { NextRequest } from 'next/server';
import { forwardAuthRequest } from '../../_lib/forward-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public second leg of sign-in. This is deliberately a static leaf rather than
 * an `/auth/2fa/*` catch-all: setup, disable and recovery-code management remain
 * bearer-protected backend routes and must never inherit this proxy boundary.
 */
export async function POST(request: NextRequest) {
  return forwardAuthRequest(request, '/auth/2fa/verify');
}
