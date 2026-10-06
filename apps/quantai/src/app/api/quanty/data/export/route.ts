// ============================================================================
// POST /api/quanty/data/export — export the data QuantAI holds about you.
//
// Returns a real JSON download. Only includes what this service can actually
// see: profile claims decoded from the caller's own session token, plus a
// coverage manifest that honestly says what is (and isn't) included.
// Nothing is fabricated: unknown fields are omitted, never invented.
// ============================================================================
import { NextResponse } from 'next/server';

interface TokenClaims {
  id?: string;
  sub?: string;
  email?: string;
  username?: string;
  displayName?: string;
  name?: string;
  plan?: string;
}

function decodeClaims(token: string): TokenClaims | null {
  // JWT: decode payload without verifying (export is informational; the
  // caller already proved possession of the token to get here).
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
      ) as TokenClaims;
      return payload;
    } catch {
      return null;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length <= 7) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: sign in to export your data.' },
      { status: 401 },
    );
  }

  const token = authHeader.substring(7);
  const claims = decodeClaims(token);

  const profile: Record<string, string> = {};
  if (claims?.id || claims?.sub) profile.id = String(claims.id ?? claims.sub);
  if (claims?.email) profile.email = String(claims.email);
  const displayName = claims?.displayName ?? claims?.name ?? claims?.username;
  if (displayName) profile.displayName = String(displayName);
  if (claims?.plan) profile.plan = String(claims.plan);

  const exportedAt = new Date().toISOString();
  const payload = {
    format: 'quanty-data-export/1',
    exportedAt,
    coverage: {
      included: [
        'profile: identity claims from your current session token (id, email, display name, plan — only fields present in the token)',
      ],
      notIncluded: [
        'Conversation history lives in the agent backend and is not yet included in self-serve export.',
        'Data held by other Quant apps (QuantMail, QuantChat, …) must be exported from each app.',
      ],
    },
    data: {
      profile,
    },
  };

  const filename = `quanty-data-export-${exportedAt.slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
