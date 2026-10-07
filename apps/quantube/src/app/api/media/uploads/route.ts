import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// POST /api/media/uploads — initialize a resumable chunked upload session.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/media/uploads', {
    body: await request.json().catch(() => ({})),
  });
}
