import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';
// QC-F-129: 15s, the history-proxy pattern — deliberately NOT the shared
// proxyToBackend's 1500ms. End/leave run LiveKit deleteRoom/removeParticipant
// behind them, which can take longer than 1.5s under load; a premature
// timeout would report a real, completed teardown as a failure.
const FETCH_TIMEOUT_MS = 15000;

type ErrorShape = {
  success: false;
  error: { code: string; message: string; statusCode: number };
};

/**
 * POST proxy for the QuantChat calls family (QC-F-129 — end/leave/join/initiate).
 *
 * Forwards to the REAL backend route and relays its status + envelope
 * verbatim. Honest 503 when the backend is unreachable — never a fabricated
 * success (before QC-F-129 the web hangup claimed 'Call ended' on a phantom
 * path while the server-side call stayed alive).
 */
export async function proxyCallsPost(
  request: NextRequest,
  backendPath: string,
  body: unknown,
  failureNoun: string,
): Promise<NextResponse> {
  const url = new URL(backendPath, BACKEND_URL);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('Authorization') || '',
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    const payload: ErrorShape = {
      success: false,
      error: {
        code: timedOut ? 'CALLS_TIMEOUT' : 'CALLS_UNAVAILABLE',
        message: timedOut
          ? `${failureNoun} timed out`
          : `${failureNoun} — the call service is unreachable right now`,
        statusCode: 503,
      },
    };
    return NextResponse.json(payload, { status: 503 });
  } finally {
    clearTimeout(timeoutId);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    const payload: ErrorShape = {
      success: false,
      error: {
        code: 'CALLS_BAD_RESPONSE',
        message: `${failureNoun} returned an invalid response`,
        statusCode: 502,
      },
    };
    return NextResponse.json(payload, { status: 502 });
  }
  return NextResponse.json(data, { status: res.status });
}
