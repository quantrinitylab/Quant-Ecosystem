import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

/** Block proxy (QC-F-317) — forwards POST to backend `/settings/blocked/:userId`. Body-less: the backend builds the block entry from the target's real user row. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  try {
    const res = await fetch(
      new URL(`/settings/blocked/${encodeURIComponent(userId)}`, BACKEND_URL).toString(),
      { method: 'POST', headers },
    );
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Block request failed', statusCode: 0 },
      },
      { status: 502 },
    );
  }
}

/** Unblock proxy — forwards DELETE to backend `/settings/blocked/:userId`. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  try {
    const res = await fetch(
      new URL(`/settings/blocked/${encodeURIComponent(userId)}`, BACKEND_URL).toString(),
      { method: 'DELETE', headers },
    );
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Unblock request failed', statusCode: 0 },
      },
      { status: 502 },
    );
  }
}
