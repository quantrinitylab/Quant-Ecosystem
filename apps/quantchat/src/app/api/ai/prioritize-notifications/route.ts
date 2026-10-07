// AI agent proxy: POST /api/ai/prioritize-notifications -> backend (Task 12.5)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/ai/prioritize-notifications');
}
