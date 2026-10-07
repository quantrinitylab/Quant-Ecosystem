import type { NextRequest } from 'next/server';
import { proxyFederationRequest } from '../../../_lib/federation-proxy';

// POST /api/federation/instances/block — block a remote instance.
export async function POST(request: NextRequest) {
  return proxyFederationRequest(request, '/federation/instances/block', {
    body: await request.json().catch(() => ({})),
  });
}
