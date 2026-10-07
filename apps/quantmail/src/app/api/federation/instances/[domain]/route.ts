import type { NextRequest } from 'next/server';
import { proxyFederationRequest } from '../../../_lib/federation-proxy';

// GET /api/federation/instances/:domain — federation status of a remote instance.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> },
) {
  const { domain } = await params;
  return proxyFederationRequest(request, `/federation/instances/${encodeURIComponent(domain)}`);
}
