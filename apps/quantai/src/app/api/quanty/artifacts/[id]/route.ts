// Quanty artifact detail proxy (Layer 4):
//   GET    /api/quanty/artifacts/:id        -> backend GET    /quanty/artifacts/:id
//   PATCH  /api/quanty/artifacts/:id        -> backend PATCH  /quanty/artifacts/:id/opened (record last opened)
//   DELETE /api/quanty/artifacts/:id        -> backend DELETE /quanty/artifacts/:id
import { NextRequest, NextResponse } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
  }
  return proxyAgentRequest(request, `/quanty/artifacts/${encodeURIComponent(id)}`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
  }
  // Only mutation supported on this route is "record last opened".
  return proxyAgentRequest(
    request,
    `/quanty/artifacts/${encodeURIComponent(id)}/opened`,
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
  }
  return proxyAgentRequest(request, `/quanty/artifacts/${encodeURIComponent(id)}`);
}
