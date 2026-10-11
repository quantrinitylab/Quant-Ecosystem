// ============================================================================
// POST /api/agentic/confirm/:planId — resume a held agent plan (Sentinel).
// ============================================================================
//
// This is the ONLY way a tier-2+ tool plan executes: the backend holds the
// plan server-side (bound to the verified user, single-use, 10-minute TTL)
// and resumes it here after explicit user approval. Client-asserted
// `confirmed: true` / `confirmedSteps` are never honored anywhere.
//
// Auth is verified on the backend (real JWT verification via requireAuth).
// This route forwards the Authorization header verbatim and relays the
// backend's verdict: 401 (bad token), 403 (plan belongs to another user),
// 404 (unknown/expired plan). Fail closed — no fallback, no execution.

import { NextRequest, NextResponse } from 'next/server';
import { QUANTAI_BACKEND_URL } from '../../../_lib/agent-proxy';

export const dynamic = 'force-dynamic';

/** planIds are minted by the backend as `plan-<ts>-<rand>`; allowlist the shape. */
const PLAN_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(
  request: NextRequest | Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json(
      { error: 'Unauthorized: missing Authorization header' },
      { status: 401 },
    );
  }

  const { planId } = await params;
  if (!PLAN_ID_PATTERN.test(planId)) {
    return NextResponse.json({ error: 'Invalid plan id' }, { status: 400 });
  }

  let approved: unknown;
  try {
    approved = ((await request.json()) as { approved?: unknown }).approved;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof approved !== 'boolean') {
    return NextResponse.json(
      { error: 'Missing required field: approved (boolean)' },
      { status: 400 },
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: authHeader,
  };
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers['cookie'] = cookie;
  }
  headers['x-request-id'] = request.headers.get('x-request-id') ?? crypto.randomUUID();

  let upstream: Response;
  try {
    upstream = await fetch(
      `${QUANTAI_BACKEND_URL}/agentic/confirm/${encodeURIComponent(planId)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ approved }),
      },
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Agent backend is unreachable. The held plan was not executed.',
        code: 'UPSTREAM_UNAVAILABLE',
      },
      { status: 503 },
    );
  }

  const text = await upstream.text().catch(() => '');
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
