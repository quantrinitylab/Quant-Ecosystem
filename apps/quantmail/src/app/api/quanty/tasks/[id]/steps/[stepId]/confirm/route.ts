// POST /api/quanty/tasks/:id/steps/:stepId/confirm — "Haan, karo".
// Approves the task's pending destructive step. The stepId is the frontend's
// handle; the backend confirms the currently-waiting step. -> 204
import { NextRequest, NextResponse } from 'next/server';
import { backendJson, backendUnavailable } from '../../../../../_lib/backend';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const { id } = await params;
  const { status } = await backendJson(request, `/api/quanty/tasks/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    jsonBody: { approved: true },
  });
  if (status === 502) return backendUnavailable();
  if (status === 404) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
