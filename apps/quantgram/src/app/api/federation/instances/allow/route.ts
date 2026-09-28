import type { NextRequest } from 'next/server';
import { proxyFederationRequest } from '../../../_lib/federation-proxy';

// POST /api/federation/instances/allow — add a remote instance to the allowlist.
export async function POST(request: NextRequest) {
  return proxyFederationRequest(request, '/federation/instances/allow', {
    body: await request.json().catch(() => ({})),
  });
}
