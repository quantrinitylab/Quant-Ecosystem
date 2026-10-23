import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

// QC-F-556: gated single-story fetch — the resolution target for share
// cards and shareable links. Follows the feed proxy's honest pattern
// (QC-F-379's lesson): transport failure is a 503 with a JSON error, a
// non-JSON backend body is a 502 — never an HTML 500. The backend itself
// answers 404 for missing/expired/audience-gated stories alike, and that
// status + body are forwarded untouched.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storyId: string }> },
) {
  const { storyId } = await params;
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/stories/${storyId}`, {
      headers: { Authorization: request.headers.get('Authorization') || '' },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Stories service unreachable' },
      { status: 503 },
    );
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Stories service returned an invalid response' },
      { status: 502 },
    );
  }
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ storyId: string }> },
) {
  const { storyId } = await params;
  const res = await fetch(`${BACKEND_URL}/stories/${storyId}`, {
    method: 'DELETE',
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
