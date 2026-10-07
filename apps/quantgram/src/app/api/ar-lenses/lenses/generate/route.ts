import type { NextRequest } from 'next/server';
import { proxyArLensesRequest } from '../../../_lib/ar-lenses-proxy';

// POST /api/ar-lenses/lenses/generate — forwards a generative try-on lens
// request to the backend ar-lenses route (Layer 4). proxyToBackend reads and
// forwards the JSON body when none is supplied explicitly.
export async function POST(request: NextRequest) {
  return proxyArLensesRequest(request, '/ar-lenses/lenses/generate', {
    body: await request.json().catch(() => ({})),
  });
}
