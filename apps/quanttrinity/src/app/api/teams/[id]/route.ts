import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SECTORS, TEAM_ROLES } from '../../../../lib/domain';
import { updateTeamMember } from '../../../../lib/store';

const patchSchema = z.object({
  sector: z.enum(SECTORS).optional(),
  role: z.enum(TEAM_ROLES).optional(),
  status: z.enum(['active', 'suspended', 'invited']).optional(),
  ai: z
    .object({
      modelId: z.string().min(1),
      autonomy: z.enum(['suggest', 'act-with-approval', 'autonomous']),
      dailyCreditBudget: z.number().int().min(0).max(100_000),
      mandate: z.string().min(1).max(500),
    })
    .optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', code: 'BAD_REQUEST' } },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: parsed.error.issues[0]?.message ?? 'Validation failed',
          code: 'VALIDATION',
        },
      },
      { status: 422 },
    );
  }

  const member = updateTeamMember(id, parsed.data);
  if (!member) {
    return NextResponse.json(
      { success: false, error: { message: 'Team member not found', code: 'NOT_FOUND' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: member });
}
