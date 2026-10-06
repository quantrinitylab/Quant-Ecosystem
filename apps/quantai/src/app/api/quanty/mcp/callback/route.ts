// GET /api/quanty/mcp/callback — OAuth callback landing (Q2 exchanges the code).
// Proxies to the backend; the backend 302s back into the app on success.
import type { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client';
import { QUANTY_MCP_BACKEND_URL } from '../_lib';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, {
    backendUrl: QUANTY_MCP_BACKEND_URL,
    path: '/api/quanty/mcp/callback',
    searchParams: request.nextUrl.searchParams,
    timeout: 15000,
  });
}
