import type { NextRequest } from 'next/server';
import { proxyFeedRequest } from '../../../_lib/feed-proxy';

// GET /api/feed/runtime/models — cached ONNX model manifests (ml-runtime).
export async function GET(request: NextRequest) {
  return proxyFeedRequest(request, '/feed/runtime/models');
}
