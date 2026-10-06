// POST /api/quanty/tasks — submit a natural-language command.
// Response: { taskId } (frontend QuantySubmitResponse contract).
import { NextRequest, NextResponse } from 'next/server';
import { backendJson, backendUnavailable } from '../_lib/backend';

export async function POST(request: NextRequest) {
  let command: string;
  try {
    const body = await request.json();
    command = typeof body?.command === 'string' ? body.command : '';
  } catch {
    command = '';
  }
  if (!command.trim()) {
    return NextResponse.json({ error: 'command is required' }, { status: 400 });
  }
  const { status, body } = await backendJson<{ taskId: string }>(request, '/api/quanty/tasks', {
    method: 'POST',
    jsonBody: { command: command.trim() },
  });
  if (status === 502) return backendUnavailable();
  if (!body.success || !body.data?.taskId) {
    return NextResponse.json(
      { error: body.error?.message ?? 'Could not start task' },
      { status: status === 200 ? 500 : status },
    );
  }
  return NextResponse.json({ taskId: body.data.taskId });
}
