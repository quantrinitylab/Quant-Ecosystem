import { NextRequest, NextResponse } from 'next/server';
import { proxyCallsPost } from '../../_lib/calls-proxy';

/**
 * POST /api/calls/[callId]/end — QC-F-129.
 * Proxies to the REAL backend route POST /calls/:id/end (participant-gated
 * teardown + durable ENDED row, shared with POST /calls/end). The frontend
 * endCall() has always posted here; before this proxy existed the request
 * 404'd on Next and the page claimed 'ended' anyway. The backend's
 * status + envelope are relayed verbatim — an unreachable backend yields
 * an honest 503, never a fake 'Call ended'.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> },
): Promise<NextResponse> {
  const { callId } = await context.params;
  return proxyCallsPost(
    request,
    `/calls/${encodeURIComponent(callId)}/end`,
    {},
    'Could not end the call',
  );
}
