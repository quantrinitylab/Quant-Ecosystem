import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';
import { BACKEND_URL } from '../../_lib/backend';

export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: '/posts/quote', body });
}
