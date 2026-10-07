import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// POST /api/feed/score — score features through the ml-pipeline inference engine.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/feed/score', {
    body: await request.json().catch(() => ({})),
  });
}
