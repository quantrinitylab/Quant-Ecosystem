// AI agent proxy: POST /api/ai/generate-content -> backend (Task 12.7)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/ai/generate-content');
}
