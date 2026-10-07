// GET /api/quanty/tasks/:id — task status + steps (frontend QuantyTask shape).
import { NextRequest, NextResponse } from 'next/server';
import { backendJson, backendUnavailable } from '../../_lib/backend';
import { mapTask, type BackendTask } from '../../_lib/quanty-mapper';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, body } = await backendJson<BackendTask>(
    request,
    `/api/quanty/tasks/${encodeURIComponent(id)}`,
  );
  if (status === 502) return backendUnavailable();
  if (status === 404) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (!body.success || !body.data) {
    return NextResponse.json(
      { error: body.error?.message ?? 'Task unavailable' },
      { status: status === 200 ? 500 : status },
    );
  }
  return NextResponse.json(mapTask(body.data), {
    headers: { 'cache-control': 'no-store' },
  });
}
