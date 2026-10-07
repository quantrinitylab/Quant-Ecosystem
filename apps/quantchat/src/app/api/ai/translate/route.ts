// AI agent proxy: POST /api/ai/translate -> backend POST /ai/translate (Task 12.6)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/ai/translate');
}
