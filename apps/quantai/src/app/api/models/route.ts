import { NextRequest, NextResponse } from 'next/server';
import { AVAILABLE_MODELS } from '../../../types/models';

const BACKEND_URL = process.env.QUANTAI_BACKEND_URL;

export async function GET(request: NextRequest) {
  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/agents/owned/models`, {
        headers: { Authorization: request.headers.get('Authorization') || '' },
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fall through to AVAILABLE_MODELS
    }
  }
  return NextResponse.json(AVAILABLE_MODELS);
}
