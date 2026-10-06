import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

/** Account-deletion proxy — forwards DELETE to backend `/settings/account` (soft delete). */
export async function DELETE(request: NextRequest) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  try {
    const res = await fetch(new URL('/settings/account', BACKEND_URL).toString(), {
      method: 'DELETE',
      headers,
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Account deletion failed', statusCode: 0 },
      },
      { status: 502 },
    );
  }
}
