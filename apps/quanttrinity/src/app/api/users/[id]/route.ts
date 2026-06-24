import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { recordAudit } from '../../../../lib/store';

const patchSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
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
      { success: false, error: { message: 'Invalid status', code: 'VALIDATION' } },
      { status: 422 },
    );
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: { status: parsed.data.status },
      select: { id: true, username: true, status: true },
    });
    recordAudit({
      action: `user.status.${parsed.data.status.toLowerCase()}`,
      target: id,
      detail: `@${updated.username}`,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'User not found or DB unavailable', code: 'DB_ERROR' } },
      { status: 503 },
    );
  }
}
