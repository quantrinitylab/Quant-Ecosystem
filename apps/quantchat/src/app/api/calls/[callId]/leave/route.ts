import { NextRequest, NextResponse } from 'next/server';
import { proxyCallsPost } from '../../_lib/calls-proxy';

/**
 * POST /api/calls/[callId]/leave — QC-F-129.
 * Proxies to the REAL backend route POST /calls/:id/leave (removes only the
 * requesting participant; the call stays alive for the others). Group-hangup
 * contract; the 1:1 page uses /end. Verbatim relay of the backend envelope;
 * honest 503 when the backend is unreachable.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> },
): Promise<NextResponse> {
  const { callId } = await context.params;
  return proxyCallsPost(
    request,
    `/calls/${encodeURIComponent(callId)}/leave`,
    {},
    'Could not leave the call',
  );
}
