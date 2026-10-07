import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTADS_BACKEND_URL || 'http://localhost:3010';

export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: '/ai/recommend-budget', body });
}
