import { NextRequest, NextResponse } from 'next/server';
import { proxyCallsPost } from '../_lib/calls-proxy';

/**
 * POST /api/calls/initiate — QC-F-129 (enabling proxy).
 * Proxies to the REAL backend route POST /calls/initiate (1:1 call creation,
 * QC-F-218 membership-gated). The chat page's startCall posts here; before
 * this proxy existed it 404'd on Next, so a web 1:1 call could never start —
 * and a hangup had nothing real to end. The request body is forwarded as-is.
 * Verbatim relay of the backend envelope; honest 503 when unreachable.
 *
 * NOTE: this is a STATIC segment — Next resolves it before the dynamic
 * [callId] routes, so POST /api/calls/initiate never lands in
 * [callId]/join (or any other [callId] handler). Pinned by test.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CALLS_BAD_REQUEST',
          message: 'Could not start the call — invalid request body',
          statusCode: 400,
        },
      },
      { status: 400 },
    );
  }
  return proxyCallsPost(request, '/calls/initiate', body, 'Could not start the call');
}
