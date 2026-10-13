import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

// QC-F-286 — GET used to hand-forward to backend `/messages/${id}`, a route
// that DOES NOT EXIST (backend messages routes are mounted only under
// `/conversations`, where the list route is `GET /:id/messages`). Every call
// 404'd — including the chat-socket HTTP polling fallback, its only shipped
// caller (the poller now calls `/api/conversations/:id/messages` directly).
// GET is retargeted through the shared proxy to the real backend path so any
// remaining caller gets the real paginated envelope with the shared proxy's
// behaviour (auth forward, SSO-exchange retry, honest 503, timeout).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/conversations/${id}/messages`);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // NOTE (QC-F-286): this POST has NO shipped caller — apiClient.sendMessage
  // posts to `/conversations/:id/messages` via its own proxy. Its backend
  // target `/messages/:id` also does not exist, and the `:id` semantics here
  // are undefined for a send (a send needs a conversationId), so it is left
  // intentionally unchanged pending the QC-F-072 / polling Slice 2 decision
  // rather than inventing a new API in this slice.
  const { id } = await params;
  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/messages/${id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
