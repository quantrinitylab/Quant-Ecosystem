import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// GET /api/feed/runtime/cache — ONNX model cache stats (ml-runtime ModelLoader).
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/feed/runtime/cache');
}
