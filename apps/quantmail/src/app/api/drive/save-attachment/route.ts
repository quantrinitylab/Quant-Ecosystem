import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../_lib/backend-url';

/**
 * QM-M39-010 — mail attachment → Drive handoff (M39 screen 30).
 *
 * POST { attachmentId, messageId? } → proxies to the backend route, which
 * reads the real attachment bytes server-side, dedupes on content hash, and
 * returns the canonical Drive file row ({ file, deduplicated, message }).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.attachmentId !== 'string' || !body.attachmentId) {
    return NextResponse.json(
      { error: { message: 'attachmentId is required', code: 'VALIDATION_ERROR' } },
      { status: 400 },
    );
  }

  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/files/save-attachment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify(body),
  });

  // Backend may answer with a non-JSON error body (e.g. a proxy-level 413).
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json(
      { error: { message: text || 'Save to Drive failed', code: 'SAVE_ATTACHMENT_FAILED' } },
      { status: res.status || 502 },
    );
  }
}
