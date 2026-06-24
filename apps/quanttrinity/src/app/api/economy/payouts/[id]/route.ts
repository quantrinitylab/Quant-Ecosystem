import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { updatePayout } from '../../../../../lib/store';

const patchSchema = z.object({
  status: z.enum(['pending', 'approved', 'paid', 'rejected']),
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

  const payout = updatePayout(id, parsed.data.status);
  if (!payout) {
    return NextResponse.json(
      { success: false, error: { message: 'Payout not found', code: 'NOT_FOUND' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: payout });
}
