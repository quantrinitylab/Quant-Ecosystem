import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/feed/models — list registered ranking models (ml-pipeline registry).
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/feed/models');
}

// POST /api/feed/models — register a ranking model.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/feed/models', {
    body: await request.json().catch(() => ({})),
  });
}
