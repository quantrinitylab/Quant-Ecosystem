import type { NextRequest } from 'next/server';
import { proxyFeedRequest } from '../../_lib/feed-proxy';

// GET /api/feed/models — list registered ranking models (ml-pipeline registry).
export async function GET(request: NextRequest) {
  return proxyFeedRequest(request, '/feed/models');
}

// POST /api/feed/models — register a ranking model.
export async function POST(request: NextRequest) {
  return proxyFeedRequest(request, '/feed/models', {
    body: await request.json().catch(() => ({})),
  });
}
