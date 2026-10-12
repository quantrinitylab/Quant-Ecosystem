// AI agent proxy: GET /api/ai/auto-reply/state -> backend GET /ai/auto-reply/state (QC-F-067)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/ai/auto-reply/state');
}
