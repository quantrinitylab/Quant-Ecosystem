import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';
import { BACKEND_URL } from '../_lib/backend';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: '/spaces',
    searchParams: request.nextUrl.searchParams,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: '/spaces', body });
}
