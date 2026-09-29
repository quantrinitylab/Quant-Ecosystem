import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTSYNC_BACKEND_URL || 'http://localhost:3003';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: '/interactions/bookmarks' });
}
