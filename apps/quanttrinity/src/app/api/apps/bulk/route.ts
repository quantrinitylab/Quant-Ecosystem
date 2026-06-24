import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { bulkUpdateApps, listModels, recordAudit } from '../../../../lib/store';

const bulkSchema = z
  .object({
    status: z.enum(['live', 'maintenance', 'disabled']).optional(),
    modelId: z.string().min(1).optional(),
    sidekickEnabled: z.boolean().optional(),
    onlyIds: z.array(z.string().min(1)).optional(),
  })
  .refine((v) => v.status || v.modelId || typeof v.sidekickEnabled === 'boolean', {
    message: 'Provide at least one of status, modelId or sidekickEnabled',
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

  const parsed = bulkSchema.safeParse(body);
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

  const { onlyIds, ...patch } = parsed.data;

  // Reject unknown model ids to avoid pointing apps at a model that isn't registered.
  if (patch.modelId && !listModels().some((m) => m.id === patch.modelId)) {
    return NextResponse.json(
      { success: false, error: { message: 'Unknown modelId', code: 'VALIDATION' } },
      { status: 422 },
    );
  }

  const affected = bulkUpdateApps(patch, onlyIds);
  recordAudit({
    action: 'app.control.bulk_updated',
    target: `${affected.length} app(s)`,
    detail: JSON.stringify(patch),
  });

  return NextResponse.json({ success: true, data: { count: affected.length, apps: affected } });
}
