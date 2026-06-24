import { NextResponse } from 'next/server';
import { getTeamMember } from '../../../../../lib/store';
import { getRuntimeSnapshot, runShift } from '../../../../../lib/ai-employee-runtime';

/**
 * Run one "shift" for an AI employee: it processes its sector's live queue
 * under its budget / trust / permission limits and reports what it did.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const member = getTeamMember(id);
  if (!member) {
    return NextResponse.json(
      { success: false, error: { message: 'Team member not found', code: 'NOT_FOUND' } },
      { status: 404 },
    );
  }
  if (member.kind !== 'ai') {
    return NextResponse.json(
      { success: false, error: { message: 'Member is not an AI employee', code: 'BAD_REQUEST' } },
      { status: 400 },
    );
  }
  if (member.status === 'suspended') {
    return NextResponse.json(
      { success: false, error: { message: 'AI employee is suspended', code: 'SUSPENDED' } },
      { status: 409 },
    );
  }

  const result = runShift(member);
  return NextResponse.json({ success: true, data: result });
}

/** Current runtime snapshot (trust, permission, budget) for an AI employee. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const member = getTeamMember(id);
  if (!member || member.kind !== 'ai') {
    return NextResponse.json(
      { success: false, error: { message: 'AI employee not found', code: 'NOT_FOUND' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: getRuntimeSnapshot(member) });
}
