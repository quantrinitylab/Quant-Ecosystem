import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listApps, updateApp } from '../../../lib/store';

export async function GET() {
  return NextResponse.json({ success: true, data: listApps() });
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['live', 'maintenance', 'disabled']).optional(),
  modelId: z.string().min(1).optional(),
  sidekickEnabled: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
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

  const { id, ...patch } = parsed.data;
  const app = updateApp(id, patch);
  if (!app) {
    return NextResponse.json(
      { success: false, error: { message: 'App not found', code: 'NOT_FOUND' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: app });
}
