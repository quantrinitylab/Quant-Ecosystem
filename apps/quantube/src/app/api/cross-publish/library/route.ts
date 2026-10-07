import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/cross-publish/library — list the caller's stored content.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/cross-publish/library');
}

// POST /api/cross-publish/library — store a reusable content item.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/cross-publish/library', {
    body: await request.json().catch(() => ({})),
  });
}
