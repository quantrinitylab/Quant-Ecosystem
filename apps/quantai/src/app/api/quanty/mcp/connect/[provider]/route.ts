// POST /api/quanty/mcp/connect/:provider — begin OAuth/API-key connect flow.
// Q2 contract: { authorizeUrl, state }. Honest 501 until the backend is live.
import type { NextRequest } from 'next/server';
import { proxyMcpMutation } from '../../_lib';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  return proxyMcpMutation(request, `/api/quanty/mcp/connect/${encodeURIComponent(provider)}`);
}
