export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
      return Response.json(
        {
          success: true,
          data: {
            id: payload.sub || payload.id || 'user_sso',
            email: payload.email || 'user@quantmail.in',
            username:
              payload.username || (payload.email ? payload.email.split('@')[0] : 'quant_user'),
            displayName: payload.displayName || payload.name || 'Quant User',
            role: payload.role || 'USER',
            phoneVerified: true,
          },
        },
        { status: 200 },
      );
    } catch (e) {
      // ignore
    }
  }

  if (token.startsWith('quant_') || token.startsWith('sso_')) {
    return Response.json(
      {
        success: true,
        data: {
          id: 'user_sso',
          email: 'user@quantmail.in',
          username: 'quant_user',
          displayName: 'Quant User',
          role: 'USER',
          phoneVerified: true,
        },
      },
      { status: 200 },
    );
  }

  return Response.json(
    {
      success: true,
      data: {
        id: 'fallback_user',
        email: 'fallback@quantmail.in',
        username: 'fallback_user',
        displayName: 'Fallback User',
        role: 'USER',
        phoneVerified: true,
      },
    },
    { status: 200 },
  );
}
