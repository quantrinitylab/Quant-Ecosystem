import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';
import { BACKEND_URL } from '../_lib/backend';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: '/trending',
    searchParams: request.nextUrl.searchParams,
  });
}
