// AI agent proxy: POST /api/ai/suggestions -> backend POST /ai/suggestions (Task 12.3)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/ai/suggestions');
}
