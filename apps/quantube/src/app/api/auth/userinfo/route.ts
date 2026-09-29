import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.substring(7);

  // Check if JWT
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadText = Buffer.from(payloadBase64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadText);
      return NextResponse.json({
        success: true,
        data: {
          id: payload.id || payload.sub || 'user-1',
          email: payload.email || 'user@quantmail.in',
          username: payload.username || 'user',
          displayName: payload.displayName || 'User',
          role: payload.role || 'user',
          phoneVerified: true,
        },
      });
    } catch (err) {
      // invalid token
    }
  }

  // Check custom prefix
  if (token.startsWith('quant_') || token.startsWith('sso_') || token.startsWith('qchat_sess_')) {
    return NextResponse.json({
      success: true,
      data: {
        id: 'user-1',
        email: 'user@quantmail.in',
        username: 'user',
        displayName: 'User',
        role: 'user',
        phoneVerified: true,
      },
    });
  }

  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}
