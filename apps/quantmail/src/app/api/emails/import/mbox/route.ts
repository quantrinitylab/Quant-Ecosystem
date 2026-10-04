import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

/**
 * SECURITY REPAIR (P1, 2026-10-04) — fail-fast 415 guard.
 *
 * Backend contract (verified first-hand against the backend source):
 * `POST /emails/import/mbox` accepts either a raw string body or a JSON body
 * `{ mboxData, folder?, maxMessages? }` (routes/emails.ts:1390-1411; the only
 * real web consumer, `services/api-client.ts:342-356`, posts JSON); NO
 * multipart parser is registered anywhere in the backend
 * (`@fastify/multipart` grep → zero matches repo-wide).
 *
 * Without this guard, a multipart/form-data (or any non-JSON) request would
 * make `proxyToBackend`'s `request.json()` throw, get swallowed by its
 * try/catch, and silently forward an EMPTY POST with a forged
 * `Content-Type: application/json` — a confusing, contract-violating failure.
 * Fail fast at the edge instead, without ever hitting the backend.
 *
 * NOTE: the shared `proxyToBackend` helper is intentionally NOT modified
 * (out of lane — shared by all web-wiring routes).
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type');
  if (
    contentType &&
    !/^application\/json(\s*;.*)?$/i.test(contentType.trim())
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'This endpoint accepts application/json only',
          statusCode: 415,
        },
      },
      { status: 415, headers: { 'cache-control': 'no-store' } },
    );
  }
  return proxyToBackend(request, '/emails/import/mbox');
}
