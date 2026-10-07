// AI agent proxy: POST /api/ai/summarize -> backend POST /ai/summarize (Task 12.2)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/ai/summarize');
}
