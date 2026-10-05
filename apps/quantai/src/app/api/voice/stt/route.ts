// Voice STT proxy (Layer 4):
//   POST /api/voice/stt -> backend POST /voice/stt
// Multipart passthrough — forwards the raw FormData (WAV blob), not JSON.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { QUANTAI_BACKEND_URL } from '../../_lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }
  const headers: Record<string, string> = {};
  const auth = request.headers.get('authorization');
  if (auth) headers['authorization'] = auth;
  const requestId = request.headers.get('x-request-id');
  if (requestId) headers['x-request-id'] = requestId;

  const upstream = await fetch(`${QUANTAI_BACKEND_URL}/voice/stt`, {
    method: 'POST',
    headers,
    body: form,
  }).catch(() => null);
  if (!upstream) {
    return NextResponse.json({ error: 'Voice backend unreachable' }, { status: 502 });
  }
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
