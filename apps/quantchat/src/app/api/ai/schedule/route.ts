// AI agent proxy: POST /api/ai/schedule -> backend POST /ai/schedule (Task 12.4)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/ai/schedule');
}
