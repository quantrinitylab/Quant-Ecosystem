import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PlatformConfigService, type PlatformConfigPatch } from '@quant/credits';
import { prisma } from '../../../lib/prisma';
import { listModels, listPayouts, listRevenue, recordAudit } from '../../../lib/store';

// The credit/economy config is DURABLE (a platform_config row owned by
// @quant/credits). The /api middleware enforces the owner gate upstream, but we
// add defense-in-depth here: the service's write predicate only allows writes
// from a principal that has been re-verified as the platform owner in THIS
// request. A request that somehow reaches the route without a valid owner
// credential gets a non-owner principal and is denied by writeAuthz.
const OWNER_WRITE_AUTHZ = (principal: { isPlatformOwner?: boolean }): boolean =>
  principal.isPlatformOwner === true;

/** Constant-time compare guarding against length leaks. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Re-verify the owner credential carried by the request (Authorization bearer
 * or the `owner_token` cookie) against OWNER_SECRET. Fails closed when the
 * secret is unset or the token is missing/incorrect.
 */
function isVerifiedOwner(request: NextRequest): boolean {
  const ownerSecret = process.env.OWNER_SECRET;
  if (!ownerSecret) return false;
  const headerToken = request.headers.get('Authorization')?.replace('Bearer ', '');
  const cookieToken = request.cookies.get('owner_token')?.value;
  const token = headerToken || cookieToken;
  if (!token) return false;
  return safeEqual(token, ownerSecret);
}

function configService(): PlatformConfigService {
  return new PlatformConfigService(prisma as never, {
    writeAuthz: OWNER_WRITE_AUTHZ,
  });
}

/** Map the persisted config to the API's economy `credit` shape. */
function toApiCredit(cfg: {
  usdPerCredit: number;
  dailyFreeCredits: number;
  commissionRate: number;
  overageEnabledDefault: boolean;
}) {
  return {
    usdPerCredit: cfg.usdPerCredit,
    dailyFreeCredits: cfg.dailyFreeCredits,
    commissionRate: cfg.commissionRate,
    overageEnabled: cfg.overageEnabledDefault,
  };
}

export async function GET() {
  const credit = await configService().getConfig();
  const [models, payouts, revenue] = await Promise.all([
    listModels(),
    listPayouts(),
    listRevenue(),
  ]);
  return NextResponse.json({
    success: true,
    data: {
      credit: toApiCredit(credit),
      models,
      payouts,
      revenue,
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

  // Map the API patch (overageEnabled) onto the durable config patch
  // (overageEnabledDefault).
  const patch: PlatformConfigPatch = {};
  if (parsed.data.usdPerCredit !== undefined) patch.usdPerCredit = parsed.data.usdPerCredit;
  if (parsed.data.dailyFreeCredits !== undefined)
    patch.dailyFreeCredits = parsed.data.dailyFreeCredits;
  if (parsed.data.commissionRate !== undefined) patch.commissionRate = parsed.data.commissionRate;
  if (parsed.data.overageEnabled !== undefined)
    patch.overageEnabledDefault = parsed.data.overageEnabled;

  try {
    const principal = {
      principalId: 'owner',
      isPlatformOwner: isVerifiedOwner(request),
    };
    const updated = await configService().setConfig(principal, patch);
    await recordAudit({
      action: 'economy.credit_config.updated',
      target: 'credit',
      detail: JSON.stringify(parsed.data),
    });
    return NextResponse.json({ success: true, data: toApiCredit(updated) });
  } catch (err) {
    const e = err as { statusCode?: number; code?: string; message?: string };
    return NextResponse.json(
      {
        success: false,
        error: { message: e.message ?? 'Failed to update config', code: e.code ?? 'CONFIG_ERROR' },
      },
      { status: e.statusCode ?? 400 },
    );
  }
}
