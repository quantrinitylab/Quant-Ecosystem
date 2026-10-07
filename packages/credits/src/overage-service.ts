// ============================================================================
// Billing module — OverageService (per-owner overage opt-in policy)
// quantmail-superhub · Credit economy — overage toggle (default OFF)
// ============================================================================
//
// PURPOSE
//   Owns the per-owner OVERAGE policy: whether the owner has explicitly OPTED IN
//   to let metered actions proceed BEYOND their available credit balance (the
//   excess billed as overage), and the per-period ceiling on that overage.
//
//   The product rule is "no surprise charges": overage is OFF by default. When
//   no `OverageSetting` row exists (or `enabled = false`), the policy is
//   {@link OVERAGE_DISABLED} and the wallet stays fail-closed — exactly the
//   behaviour before this service existed. A user (or QuantTrinity, centrally)
//   must deliberately enable it.
//
//   This service is the DATA + AUTHZ layer. The UsageGate consumes the policy
//   through the vendor-neutral {@link OveragePolicyPort} (default
//   {@link overageDisabledPort}), so enforcement can be wired without this
//   module reaching into the gate.
//
// MODULE BOUNDARY
//   Infrastructure module. Reuses the shared Ownership_Authz rule (the caller
//   must own the wallet or be a tenant admin), never another module's services.

import { createAppError } from './errors';
import {
  ownerOnlyAuthz,
  assertOwnership,
  type OwnershipAuthzPort,
  type OwnershipPrincipal,
} from './ownership-authz';
import type { OwnerRef } from './credit-wallet.service';

/** A persisted overage-policy row (mirrors the Prisma `OverageSetting` model). */
export interface OverageSettingRow {
  id: string;
  ownerRef: string;
  ownerType: string;
  tenantId: string | null;
  enabled: boolean;
  monthlyLimitCredits: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The MINIMAL Prisma surface this service needs — just the `overageSetting`
 * delegate's `findUnique`/`upsert`. Typed structurally (not against the full
 * generated `PrismaClient`) so the service depends only on what it uses and is
 * not coupled to the generated client's regeneration timing. The real
 * `PrismaClient` satisfies this interface at the call site.
 */
export interface OveragePrisma {
  overageSetting: {
    findUnique(args: { where: { ownerRef: string } }): Promise<OverageSettingRow | null>;
    upsert(args: {
      where: { ownerRef: string };
      update: Partial<Omit<OverageSettingRow, 'id' | 'createdAt' | 'updatedAt'>>;
      create: Omit<OverageSettingRow, 'createdAt' | 'updatedAt'> &
        Partial<Pick<OverageSettingRow, 'createdAt' | 'updatedAt'>>;
    }): Promise<OverageSettingRow>;
  };
}

/** An owner's resolved overage policy. */
export interface OveragePolicy {
  /** Whether the owner opted in to over-balance (billable) spend. */
  enabled: boolean;
  /** Ceiling on overage credits per UTC month (0 = none allowed). */
  monthlyLimitCredits: number;
}

/** The default, fail-closed policy: overage OFF, no allowance. */
export const OVERAGE_DISABLED: OveragePolicy = Object.freeze({
  enabled: false,
  monthlyLimitCredits: 0,
});

export interface OverageServiceOptions {
  /** Ownership authz filter. Defaults to the shared owner-only rule. */
  authz?: OwnershipAuthzPort;
  /** Id generator seam (overridable for deterministic tests). */
  generateId?: () => string;
}

/** Mutation payload for {@link OverageService.setPolicy}. */
export interface SetOverageArgs {
  enabled: boolean;
  /** Per-month overage ceiling in whole credits (>= 0). Defaults to 0. */
  monthlyLimitCredits?: number;
}

function nonEmpty(s: string | undefined | null): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/**
 * Reads and writes the per-owner {@link OveragePolicy}. Both operations are
 * gated by the shared Ownership_Authz filter (owner or tenant admin), mirroring
 * `CreditWallet.getBalance`.
 */
export class OverageService {
  private readonly authz: OwnershipAuthzPort;
  private readonly generateId: () => string;

  constructor(
    private readonly prisma: OveragePrisma,
    options: OverageServiceOptions = {},
  ) {
    this.authz = options.authz ?? ownerOnlyAuthz;
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  /**
   * Resolve an owner's overage policy. Returns {@link OVERAGE_DISABLED} when no
   * row exists — overage is OFF unless the owner explicitly turned it on.
   *
   * @throws 403 FORBIDDEN  when the caller is neither owner nor tenant admin.
   */
  async getPolicy(caller: OwnershipPrincipal, ownerRef: OwnerRef): Promise<OveragePolicy> {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    assertOwnership(this.authz, caller, {
      ownerId: ownerRef.ownerId,
      tenantId: ownerRef.tenantId,
      kind: 'wallet',
      resourceId: ownerRef.ownerId,
    });

    const row = await this.prisma.overageSetting.findUnique({
      where: { ownerRef: ownerRef.ownerId },
    });
    if (!row) return { ...OVERAGE_DISABLED };
    return {
      enabled: row.enabled,
      monthlyLimitCredits: row.monthlyLimitCredits,
    };
  }

  /**
   * Enable/disable overage and set the monthly ceiling for `ownerRef`
   * (upsert — exactly one policy per owner).
   *
   * @throws 403 FORBIDDEN              caller is neither owner nor tenant admin.
   * @throws 400 INVALID_OVERAGE_LIMIT  `monthlyLimitCredits` is not a whole number >= 0.
   */
  async setPolicy(
    caller: OwnershipPrincipal,
    ownerRef: OwnerRef,
    args: SetOverageArgs,
  ): Promise<OveragePolicy> {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    assertOwnership(this.authz, caller, {
      ownerId: ownerRef.ownerId,
      tenantId: ownerRef.tenantId,
      kind: 'wallet',
      resourceId: ownerRef.ownerId,
    });

    const enabled = args.enabled === true;
    const limit = args.monthlyLimitCredits ?? 0;
    if (!Number.isInteger(limit) || limit < 0) {
      throw createAppError(
        'monthlyLimitCredits must be a non-negative whole number',
        400,
        'INVALID_OVERAGE_LIMIT',
      );
    }

    const ownerType = ownerRef.ownerType ?? 'user';
    const tenantId = ownerRef.tenantId ?? null;
    const row = await this.prisma.overageSetting.upsert({
      where: { ownerRef: ownerRef.ownerId },
      update: { enabled, monthlyLimitCredits: limit, ownerType, tenantId },
      create: {
        id: this.generateId(),
        ownerRef: ownerRef.ownerId,
        ownerType,
        tenantId,
        enabled,
        monthlyLimitCredits: limit,
      },
    });
    return { enabled: row.enabled, monthlyLimitCredits: row.monthlyLimitCredits };
  }
}

// ---------------------------------------------------------------------------
// OveragePolicyPort — the seam the UsageGate will consume
// ---------------------------------------------------------------------------

/**
 * Reads an owner's overage policy by the gate's string `ownerRef`. The default
 * is {@link overageDisabledPort} (always OFF), which preserves the gate's
 * fail-closed behaviour until an owner opts in.
 */
export interface OveragePolicyPort {
  getPolicy(ownerRef: string): OveragePolicy | Promise<OveragePolicy>;
}

/** A port that reports overage permanently OFF (the gate's fail-closed default). */
export const overageDisabledPort: OveragePolicyPort = {
  getPolicy() {
    return OVERAGE_DISABLED;
  },
};

export interface OveragePolicyPortOptions {
  /** Map the gate's string `ownerRef` to the service's {@link OwnerRef}. */
  resolveOwner?(ownerRef: string): OwnerRef;
  /** Resolve the principal authorized to read the owner's policy. */
  resolveCaller?(ownerRef: string): OwnershipPrincipal;
}

/**
 * Build an {@link OveragePolicyPort} backed by the real {@link OverageService}.
 * Defaults treat the gate's `ownerRef` string as a user id reading its OWN
 * policy (the gate meters on behalf of the owner whose action it gates).
 */
export function createOveragePolicyPort(
  service: OverageService,
  options: OveragePolicyPortOptions = {},
): OveragePolicyPort {
  const resolveOwner = options.resolveOwner ?? ((ref: string): OwnerRef => ({ ownerId: ref }));
  const resolveCaller =
    options.resolveCaller ?? ((ref: string): OwnershipPrincipal => ({ principalId: ref }));
  return {
    getPolicy(ownerRef: string): Promise<OveragePolicy> {
      return service.getPolicy(resolveCaller(ownerRef), resolveOwner(ownerRef));
    },
  };
}
