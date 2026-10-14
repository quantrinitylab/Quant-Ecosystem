import { NextRequest, NextResponse } from 'next/server';
import { AVAILABLE_MODELS } from '../../../types/models';
import { QUANTAI_BACKEND_URL } from '../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${QUANTAI_BACKEND_URL}/agents/owned/models`, {
      headers: { Authorization: request.headers.get('Authorization') || '' },
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // Fall through to AVAILABLE_MODELS
  }
  return NextResponse.json(AVAILABLE_MODELS);
}
