// ============================================================================
// PlatformConfigService — the owner-controlled, persisted credit/economy config
// (QuantTrinity central control). Part of @quant/credits.
// ============================================================================
//
// PURPOSE
//   Req 9 of the credits economy: the platform owner tunes credit value, the
//   daily free allowance, the marketplace/creator commission, and the DEFAULT
//   overage stance centrally — and those values are DURABLE (a `platform_config`
//   row), not in-memory constants. PricingEngine / PlanService / OverageService
//   read this config through the adapter factories below, so a change in
//   QuantTrinity propagates to metering, plans, and the marketplace.
//
// AUTHZ (Req 6.5 / 9.1)
//   Reads are open to the platform (config is non-secret), but WRITES are
//   owner/admin-only — enforced by an injected predicate so the package stays
//   domain-free. The default predicate denies everyone (fail closed) until the
//   app wires QuantTrinity's owner check.

import { z } from 'zod';
import { createAppError } from './errors';

/** The persisted economy configuration shape. */
export interface PlatformCreditConfig {
  /** USD value of one credit (1 credit ≈ 1 USD by default). */
  usdPerCredit: number;
  /** Free daily credit allowance granted to every user (whole credits). */
  dailyFreeCredits: number;
  /** Platform commission on creator/seller earnings, 0..1. */
  commissionRate: number;
  /** DEFAULT overage stance for new owners (OFF by default — no surprise charges). */
  overageEnabledDefault: boolean;
}

/** The canonical defaults used to seed the config row on first read. */
export const DEFAULT_PLATFORM_CONFIG: PlatformCreditConfig = {
  usdPerCredit: 1,
  dailyFreeCredits: 100,
  commissionRate: 0.2,
  overageEnabledDefault: false,
};

/** Validated bounds for an owner config update (partial patch). */
export const PlatformConfigPatchSchema = z
  .object({
    usdPerCredit: z.number().positive().max(1000),
    dailyFreeCredits: z.number().int().min(0).max(1_000_000),
    commissionRate: z.number().min(0).max(0.9),
    overageEnabledDefault: z.boolean(),
  })
  .partial()
  .strict();

export type PlatformConfigPatch = z.infer<typeof PlatformConfigPatchSchema>;

/** The principal making a config request (owner/admin gate). */
export interface ConfigPrincipal {
  principalId: string;
  isPlatformOwner?: boolean;
}

/** Owner/admin write predicate — true iff the principal may write the config. */
export type ConfigWriteAuthz = (principal: ConfigPrincipal) => boolean;

/** The slice of PrismaClient PlatformConfigService needs (testable double). */
export interface PlatformConfigPrisma {
  platformConfig: {
    findUnique(args: { where: { scope: string } }): Promise<PlatformConfigRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<PlatformConfigRow>;
    update(args: {
      where: { scope: string };
      data: Record<string, unknown>;
    }): Promise<PlatformConfigRow>;
  };
}

/** The persisted row shape (mirrors the Prisma model). */
export interface PlatformConfigRow extends PlatformCreditConfig {
  id: string;
  scope: string;
  updatedBy: string | null;
}

export interface PlatformConfigServiceOptions {
  /** The config scope ("global" by default; a tenant id for per-tenant config). */
  scope?: string;
  /** Owner/admin write predicate. Defaults to DENY ALL (fail closed). */
  writeAuthz?: ConfigWriteAuthz;
  /** Id generator seam (overridable for deterministic tests). */
  generateId?: () => string;
}

const denyAll: ConfigWriteAuthz = () => false;

export class PlatformConfigService {
  private readonly scope: string;
  private readonly writeAuthz: ConfigWriteAuthz;
  private readonly generateId: () => string;

  constructor(
    private readonly prisma: PlatformConfigPrisma,
    options: PlatformConfigServiceOptions = {},
  ) {
    this.scope = options.scope ?? 'global';
    this.writeAuthz = options.writeAuthz ?? denyAll;
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  /**
   * Read the current config, seeding the defaults row on first access. Never
   * throws on authz (config values are non-secret and read widely by engines).
   */
  async getConfig(): Promise<PlatformCreditConfig> {
    const row = await this.prisma.platformConfig.findUnique({ where: { scope: this.scope } });
    if (row != null) {
      return this.toConfig(row);
    }
    const created = await this.prisma.platformConfig.create({
      data: { id: this.generateId(), scope: this.scope, ...DEFAULT_PLATFORM_CONFIG },
    });
    return this.toConfig(created);
  }

  /**
   * Apply an owner/admin config patch. Validates bounds and requires the
   * principal to pass the write predicate (fail closed by default).
   *
   * @throws 403 FORBIDDEN          principal may not write the config.
   * @throws 400 INVALID_CONFIG     patch is empty or out of bounds.
   */
  async setConfig(
    principal: ConfigPrincipal,
    patch: PlatformConfigPatch,
  ): Promise<PlatformCreditConfig> {
    if (!this.writeAuthz(principal)) {
      throw createAppError('Not authorized to update platform config', 403, 'FORBIDDEN');
    }
    const parsed = PlatformConfigPatchSchema.safeParse(patch);
    if (!parsed.success) {
      throw createAppError(
        `Invalid platform config patch: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        400,
        'INVALID_CONFIG',
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      throw createAppError('platform config patch is empty', 400, 'INVALID_CONFIG');
    }

    // Ensure the row exists (seed defaults), then apply the patch.
    await this.getConfig();
    const updated = await this.prisma.platformConfig.update({
      where: { scope: this.scope },
      data: { ...parsed.data, updatedBy: principal.principalId },
    });
    return this.toConfig(updated);
  }

  private toConfig(row: PlatformConfigRow): PlatformCreditConfig {
    return {
      usdPerCredit: row.usdPerCredit,
      dailyFreeCredits: row.dailyFreeCredits,
      commissionRate: row.commissionRate,
      overageEnabledDefault: row.overageEnabledDefault,
    };
  }
}

// ---------------------------------------------------------------------------
// Adapters — feed the persisted config into the credits engines via their seams
// ---------------------------------------------------------------------------

/**
 * A {@link DailyAllowanceProvider} (CreditWallet seam) backed by the persisted
 * config: every `grantDaily` resolves the current `dailyFreeCredits`, so an
 * owner change in QuantTrinity takes effect on the next grant without a deploy.
 */
export function createConfigDailyAllowanceProvider(
  configService: Pick<PlatformConfigService, 'getConfig'>,
): () => Promise<number> {
  return async () => (await configService.getConfig()).dailyFreeCredits;
}

/**
 * Resolve the current marketplace/creator commission rate (0..1) from config —
 * pass into `MarketplaceLedger`/payout accounting so the rate is owner-tunable.
 */
export async function resolveCommissionRate(
  configService: Pick<PlatformConfigService, 'getConfig'>,
): Promise<number> {
  return (await configService.getConfig()).commissionRate;
}

/**
 * Resolve the USD value of one credit from config — used by pricing/top-up and
 * payout valuation so 1 credit ≈ usdPerCredit stays centrally controlled.
 */
export async function resolveUsdPerCredit(
  configService: Pick<PlatformConfigService, 'getConfig'>,
): Promise<number> {
  return (await configService.getConfig()).usdPerCredit;
}
