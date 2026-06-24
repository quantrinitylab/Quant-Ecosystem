import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getCreditConfig,
  listModels,
  listPayouts,
  listRevenue,
  recordAudit,
  updateCreditConfig,
} from '../../../lib/store';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      credit: getCreditConfig(),
      models: listModels(),
      payouts: listPayouts(),
      revenue: listRevenue(),
    },
  });
}

const patchSchema = z.object({
  usdPerCredit: z.number().min(0).max(1000).optional(),
  dailyFreeCredits: z.number().int().min(0).max(100_000).optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  overageEnabled: z.boolean().optional(),
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

  const updated = updateCreditConfig(parsed.data);
  recordAudit({
    action: 'economy.credit_config.updated',
    target: 'credit',
    detail: JSON.stringify(parsed.data),
  });
  return NextResponse.json({ success: true, data: updated });
}
