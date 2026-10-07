import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

/** Data-export proxy — forwards POST to backend `/settings/export` (JSON download). */
export async function POST(request: NextRequest) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  try {
    const res = await fetch(new URL('/settings/export', BACKEND_URL).toString(), {
      method: 'POST',
      headers,
    });
    const buffer = await res.arrayBuffer().catch(() => null);
    if (buffer === null) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NETWORK_ERROR', message: 'Export request failed', statusCode: 0 },
        },
        { status: 502 },
      );
    }
    return new NextResponse(buffer, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/json',
        'Content-Disposition':
          res.headers.get('Content-Disposition') || 'attachment; filename="quantchat-data.json"',
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Export request failed', statusCode: 0 },
      },
      { status: 502 },
    );
  }
}
