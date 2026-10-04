// Voice TTS proxy (Layer 4):
//   POST /api/voice/tts -> backend POST /voice/tts (audio bytes)
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { QUANTAI_BACKEND_URL } from '../../_lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const auth = request.headers.get('authorization');
  if (auth) headers['authorization'] = auth;

  const upstream = await fetch(`${QUANTAI_BACKEND_URL}/voice/tts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!upstream) {
    return NextResponse.json({ error: 'Voice backend unreachable' }, { status: 502 });
  }
  const audio = await upstream.arrayBuffer();
  return new NextResponse(audio, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'audio/mpeg' },
  });
}
