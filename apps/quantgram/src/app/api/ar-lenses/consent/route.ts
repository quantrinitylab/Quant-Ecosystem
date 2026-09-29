import type { NextRequest } from 'next/server';
import { proxyArLensesRequest } from '../../_lib/ar-lenses-proxy';

// GET /api/ar-lenses/consent — list the user's active AR face-consent records.
export async function GET(request: NextRequest) {
  return proxyArLensesRequest(request, '/ar-lenses/consent');
}

// POST /api/ar-lenses/consent — grant AR face-tracking consent for the user.
export async function POST(request: NextRequest) {
  return proxyArLensesRequest(request, '/ar-lenses/consent', {
    body: await request.json().catch(() => ({})),
  });
}
