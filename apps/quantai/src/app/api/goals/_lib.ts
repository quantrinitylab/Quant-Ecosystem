import { NextRequest, NextResponse } from 'next/server';

import { QUANTAI_BACKEND_URL } from '../_lib/agent-proxy';
function authHeaders(request: NextRequest): Record<string, string> {
  return { Authorization: request.headers.get('Authorization') || '' };
}

/**
 * Thin proxy: forwards Quanty Goals calls to the Fastify backend.
 * The backend owns auth (Bearer) and persistence; this layer only
 * forwards the Authorization header, query string and body.
 */
export async function proxyGoals(
  request: NextRequest,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
): Promise<NextResponse> {
  const url = new URL(path, QUANTAI_BACKEND_URL);
  const incoming = new URL(request.url);
  incoming.searchParams.forEach((value, key) => url.searchParams.set(key, value));

  const init: RequestInit = { method, headers: authHeaders(request) };
  if (method === 'POST' || method === 'PATCH') {
    const text = await request.text();
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = text;
  }

  const res = await fetch(url.toString(), init);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
