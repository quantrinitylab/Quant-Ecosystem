import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const backendBase = process.env.QUANTMAIL_BACKEND_URL || 'http://quant-quantmail-backend:3011';
  const targetUrl = `${backendBase}/webhook/inbound`;

  try {
    const rawBody = await request.text();
    const headers: Record<string, string> = {
      'content-type': request.headers.get('content-type') || 'text/plain',
    };

    // Forward all AWS SNS signature and message type headers
    for (const [key, value] of request.headers.entries()) {
      if (key.toLowerCase().startsWith('x-amz-')) {
        headers[key] = value;
      }
    }

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: rawBody,
      cache: 'no-store',
    });

    const responseText = await res.text();
    return new NextResponse(responseText, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'WEBHOOK_PROXY_ERROR',
          message: (error as Error).message,
        },
      },
      { status: 502 },
    );
  }
}
