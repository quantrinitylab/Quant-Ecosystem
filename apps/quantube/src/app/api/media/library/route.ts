import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/media/library — pick recent cross-app media items.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/media/library', {
    searchParams: request.nextUrl.searchParams,
  });
}

// POST /api/media/library — register a media item in the shared picker.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/media/library', {
    body: await request.json().catch(() => ({})),
  });
}
