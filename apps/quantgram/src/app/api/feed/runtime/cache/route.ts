import type { NextRequest } from 'next/server';
import { proxyFeedRequest } from '../../../_lib/feed-proxy';

// GET /api/feed/runtime/cache — ONNX model cache stats (ml-runtime ModelLoader).
export async function GET(request: NextRequest) {
  return proxyFeedRequest(request, '/feed/runtime/cache');
}
