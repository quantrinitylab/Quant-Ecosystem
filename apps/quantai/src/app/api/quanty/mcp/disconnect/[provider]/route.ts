// POST /api/quanty/mcp/disconnect/:provider — revoke a connection.
// Honest 501 until Q2's backend is live (built-ins cannot be disconnected).
import type { NextRequest } from 'next/server';
import { proxyMcpMutation } from '../../_lib';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  return proxyMcpMutation(request, `/api/quanty/mcp/disconnect/${encodeURIComponent(provider)}`);
}
