import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

// QC-F-556: share a story into a conversation as a gated reference card.
// Same honest proxy pattern as the feed proxy (QC-F-379's lesson):
// transport failure = 503 JSON, non-JSON backend body = 502 JSON, and
// the backend's own gate verdicts (404 invisible/expired story, 403
// NOT_A_MEMBER, 400) are forwarded untouched — never masked as success.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storyId: string }> },
) {
  const { storyId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 },
    );
  }
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/stories/${storyId}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('Authorization') || '',
      },
      body: JSON.stringify(body),
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
