import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SECTORS, TEAM_ROLES } from '../../../lib/domain';
import {
  createTeamMember,
  listTeam,
  recordAudit,
  type CreateTeamMemberInput,
} from '../../../lib/store';

export async function GET(request: NextRequest) {
  const sectorParam = request.nextUrl.searchParams.get('sector');
  const sector = SECTORS.find((s) => s === sectorParam);
  return NextResponse.json({ success: true, data: listTeam(sector) });
}

const aiSchema = z.object({
  modelId: z.string().min(1),
  autonomy: z.enum(['suggest', 'act-with-approval', 'autonomous']),
  dailyCreditBudget: z.number().int().min(0).max(100_000),
  mandate: z.string().min(1).max(500),
});

const createSchema = z
  .object({
    kind: z.enum(['human', 'ai']),
    name: z.string().min(1).max(120),
    email: z.string().email().optional(),
    sector: z.enum(SECTORS),
    role: z.enum(TEAM_ROLES),
    ai: aiSchema.optional(),
  })
  .refine((v) => (v.kind === 'human' ? !!v.email : true), {
    message: 'email is required for human members',
    path: ['email'],
  })
  .refine((v) => (v.kind === 'ai' ? !!v.ai : true), {
    message: 'ai config is required for AI employees',
    path: ['ai'],
  });

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', code: 'BAD_REQUEST' } },
      { status: 400 },
    );
  }

  const parsed = createSchema.safeParse(body);
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

  const member = createTeamMember(parsed.data as CreateTeamMemberInput);
  recordAudit({
    action: member.kind === 'ai' ? 'team.ai_employee.deployed' : 'team.member.invited',
    target: member.id,
    detail: `${member.name} · ${member.sector}/${member.role}`,
  });
  return NextResponse.json({ success: true, data: member }, { status: 201 });
}
