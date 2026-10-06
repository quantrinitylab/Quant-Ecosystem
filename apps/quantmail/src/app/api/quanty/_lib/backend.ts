// ============================================================================
// Quanty Next routes — backend fetch helper
// ============================================================================
//
// The Quanty UI (QuantyLiveAgent) talks to these Next routes; they translate
// between the frontend contracts and the Fastify backend at
// QUANTMAIL_BACKEND_URL:
//
//   backend:  { success: true, data } envelopes, backend task/step shapes,
//             backend SSE event vocabulary
//   frontend: raw QuantyPopupData / { taskId }, frontend task/step shapes,
//             frontend SSE vocabulary
//
// Auth (Authorization header / cookies) is forwarded 1:1 like the rest of
// the repo's proxy routes.

import { NextRequest, NextResponse } from 'next/server';

export function backendBase(): string {
  return process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';
}

export function forwardHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = request.headers.get('authorization');
  if (auth) headers['Authorization'] = auth;
  const cookie = request.headers.get('cookie');
  if (cookie) headers['Cookie'] = cookie;
  const origin = request.headers.get('origin');
  if (origin) headers['Origin'] = origin;
  return headers;
}

export interface BackendEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

/** Fetch JSON from the backend, forwarding auth. Never throws. */
export async function backendJson<T>(
  request: NextRequest,
  path: string,
  init?: RequestInit & { jsonBody?: unknown },
): Promise<{ status: number; body: BackendEnvelope<T> }> {
  const url = new URL(path, backendBase()).toString();
  const headers = { ...forwardHeaders(request), ...((init?.headers as Record<string, string>) ?? {}) };
  const { jsonBody, ...fetchInit } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...fetchInit,
      headers,
      body: jsonBody !== undefined ? JSON.stringify(jsonBody) : fetchInit.body,
      cache: 'no-store',
    });
  } catch {
    return {
      status: 502,
      body: { success: false, error: { code: 'BACKEND_UNAVAILABLE', message: 'Quanty backend is temporarily unavailable.' } },
    };
  }
  let body: BackendEnvelope<T>;
  try {
    body = (await res.json()) as BackendEnvelope<T>;
  } catch {
    body = { success: false, error: { code: 'INVALID_RESPONSE', message: 'Backend returned a non-JSON response.' } };
  }
  return { status: res.status, body };
}

export function backendUnavailable(): NextResponse {
  return NextResponse.json({ error: 'Quanty backend is temporarily unavailable.' }, { status: 502 });
}
