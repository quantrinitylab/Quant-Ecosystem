// POST /api/quanty/tasks/:id/steps/:stepId/cancel — "Rehne do".
// Denies the pending destructive step; the executor skips it and continues. -> 204
import { NextRequest, NextResponse } from 'next/server';
import { backendJson, backendUnavailable } from '../../../../../_lib/backend';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const { id } = await params;
  const { status } = await backendJson(request, `/api/quanty/tasks/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    jsonBody: { approved: false },
  });
  if (status === 502) return backendUnavailable();
  if (status === 404) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
