import type { NextRequest } from 'next/server';
import { proxyArLensesRequest } from '../../_lib/ar-lenses-proxy';

// GET /api/ar-lenses/capabilities?target= — forwards to the backend ar-lenses
// route, propagating the bearer + x-request-id (Layer 4).
export async function GET(request: NextRequest) {
  return proxyArLensesRequest(request, '/ar-lenses/capabilities', {
    searchParams: request.nextUrl.searchParams,
  });
}
