import { NextRequest, NextResponse } from 'next/server';

// The "Ask Quant" single-shot Q&A proxy. Targets the real QuantAI backend
// `POST /ask` (UnifiedAIService), which lives on port 3004 — NOT the legacy
// `/assistant/chat` path on 3020 that never existed.
const BACKEND_URL = process.env.QUANTAI_BACKEND_URL || 'http://localhost:3004';

interface AskChatBody {
  message?: string;
  question?: string;
  model?: string;
  systemPrompt?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as AskChatBody;
  const question = body.question ?? body.message ?? '';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;

  const res = await fetch(`${BACKEND_URL}/ask`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      question,
      ...(body.model ? { model: body.model } : {}),
      ...(body.systemPrompt ? { systemPrompt: body.systemPrompt } : {}),
    }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (json && (json.error?.message || json.error || json.message)) || 'AI request failed';
    return NextResponse.json({ error: message }, { status: res.status });
  }

  // Backend shape: { success: true, data: { answer, model, usage } }.
  // Project to { response } so the existing Ask Quant page renders it directly.
  const answer = json?.data?.answer ?? json?.answer ?? '';
  return NextResponse.json(
    { response: answer, model: json?.data?.model, usage: json?.data?.usage },
    { status: 200 },
  );
}
