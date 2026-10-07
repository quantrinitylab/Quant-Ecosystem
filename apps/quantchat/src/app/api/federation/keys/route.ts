import type { NextRequest } from 'next/server';
import { proxyFederationRequest } from '../../_lib/federation-proxy';

// GET /api/federation/keys — list the authenticated user's federation API keys.
export async function GET(request: NextRequest) {
  return proxyFederationRequest(request, '/federation/keys');
}

// POST /api/federation/keys — mint a scoped federation API key for the user.
export async function POST(request: NextRequest) {
  return proxyFederationRequest(request, '/federation/keys', {
    body: await request.json().catch(() => ({})),
  });
}
