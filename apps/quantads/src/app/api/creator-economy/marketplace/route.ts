import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTADS_BACKEND_URL || 'http://localhost:3010';

// GET /api/creator-economy/marketplace -> active creator listings (no identity needed).
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: '/creator-economy/marketplace' });
}
