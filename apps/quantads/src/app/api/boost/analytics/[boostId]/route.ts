import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTADS_BACKEND_URL || 'http://localhost:3010';

// GET /api/boost/analytics/:boostId -> real boost analytics (starts at 0).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boostId: string }> },
) {
  const { boostId } = await params;
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: `/boost/analytics/${encodeURIComponent(boostId)}`,
  });
}
