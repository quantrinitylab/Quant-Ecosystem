// AI agent proxy: POST /api/ai/auto-reply/toggle -> backend POST /ai/auto-reply/toggle (Task 12.9)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/ai/auto-reply/toggle');
}
