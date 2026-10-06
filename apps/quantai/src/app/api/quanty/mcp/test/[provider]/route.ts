// POST /api/quanty/mcp/test/:provider — test a live connection.
// Q2 contract: { ok, latencyMs, scopes } | { ok:false, error }.
// Honest 501 until Q2's backend is live.
import type { NextRequest } from 'next/server';
import { proxyMcpMutation } from '../../_lib';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  return proxyMcpMutation(request, `/api/quanty/mcp/test/${encodeURIComponent(provider)}`);
}
