import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../_lib/proxy';

export const dynamic = 'force-dynamic';

/**
 * fix/qm-quantgit-ci-logs-stream: dedicated SSE streaming route for CI build
 * logs (`GET /api/ci/builds/:id/logs`, consumed by BuildTerminal's
 * EventSource). The backend endpoint answers with `text/event-stream`; the
 * generic proxyToBackend path buffers every response with
 * `await res.json()` + `NextResponse.json(...)`, which either hangs the fetch
 * until the stream closes or throws into a 502 INVALID_RESPONSE — and never
 * sets the `text/event-stream` Content-Type a browser EventSource requires.
 * This route opts into stream-through mode: the backend body is piped
 * untouched with SSE headers (no JSON parsing, no buffering, no caching).
 * Backend error statuses (e.g. 404 BUILD_NOT_FOUND) still arrive
 * JSON-buffered as honest errors, never as a fake stream.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/ci/builds/${encodeURIComponent(id)}/logs`, {
    stream: true,
  });
}
