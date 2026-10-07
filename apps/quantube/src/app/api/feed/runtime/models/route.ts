import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// GET /api/feed/runtime/models — cached ONNX model manifests (ml-runtime).
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/feed/runtime/models');
}
