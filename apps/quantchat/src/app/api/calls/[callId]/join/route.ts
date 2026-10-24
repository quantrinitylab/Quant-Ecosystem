import { NextRequest, NextResponse } from 'next/server';
import { proxyCallsPost } from '../../_lib/calls-proxy';

/**
 * POST /api/calls/[callId]/join — QC-F-129 (enabling proxy).
 * Proxies to the REAL backend route POST /calls/:id/join (participant-gated
 * token mint). Before this proxy existed the call page could not join a
 * call from the web at all — POST /api/calls/:id/join 404'd on Next — so a
 * hangup had nothing real to end. Verbatim relay of the backend envelope;
 * honest 503 when the backend is unreachable.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> },
): Promise<NextResponse> {
  const { callId } = await context.params;
  return proxyCallsPost(
    request,
    `/calls/${encodeURIComponent(callId)}/join`,
    {},
    'Could not join the call',
  );
}
