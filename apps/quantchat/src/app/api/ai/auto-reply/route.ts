// AI agent proxy: POST /api/ai/auto-reply -> backend POST /ai/auto-reply (Task 12.1)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/ai/auto-reply');
}
