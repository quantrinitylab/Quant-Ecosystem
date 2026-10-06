// POST /api/quanty/tasks/:id/undo — reverse a finished task's reversible steps.
// -> 204 on success, 409 when there is nothing reversible to undo (honest,
// never a fabricated success).
import { NextRequest, NextResponse } from 'next/server';
import { backendJson, backendUnavailable } from '../../../_lib/backend';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, body } = await backendJson<{ undone: number; details: string[] }>(
    request,
    `/api/quanty/tasks/${encodeURIComponent(id)}/undo`,
    { method: 'POST' },
  );
  if (status === 502) return backendUnavailable();
  if (status === 404) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (status === 409) {
    return NextResponse.json(
      { error: body.error?.message ?? 'Nothing reversible to undo for this task.' },
      { status: 409 },
    );
  }
  if (!body.success) {
    return NextResponse.json(
      { error: body.error?.message ?? 'Undo failed.' },
      { status: status === 200 ? 500 : status },
    );
  }
  return new NextResponse(null, { status: 204 });
}
