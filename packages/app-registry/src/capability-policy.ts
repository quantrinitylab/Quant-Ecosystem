/**
 * EC-01 — Policy evaluation: risk tier → approval/step-up/idempotency decisions.
 *
 * This is the registry-owned half of the §6 pipeline. It never executes a
 * side effect; it only decides whether execution may proceed and under what
 * conditions. Product policy decides whether it may; runtime authorization
 * decides whether this caller may now (§17).
 */
import type {
  Capability,
  InvocationContext,
  InvocationDecision,
} from './capability-types';
import { CapabilityError } from './capability-errors';

/** Minimal idempotency store contract — the registry owns the check, the host owns storage. */
export interface IdempotencyStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, result: unknown, ttlSeconds: number): Promise<void>;
}

/** In-memory store for single-process hosts and tests. Not for multi-instance use. */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly seen = new Map<string, { result: unknown; expiresAt: number }>();

  async get(key: string): Promise<unknown | undefined> {
    const entry = this.seen.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.seen.delete(key);
      return undefined;
    }
    return entry.result;
  }

  async set(key: string, result: unknown, ttlSeconds: number): Promise<void> {
    this.seen.set(key, { result, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

const STEP_UP_TIERS = new Set([4]);

/**
 * Evaluate whether an invocation may proceed.
 *
 * Fail-closed ordering:
 *  1. Tier 4 always needs approval AND step-up (unless stepUpCompleted).
 *  2. Tier 3 needs approval unless a durable user policy explicitly grants it.
 *  3. capability.approval.required forces approval regardless of tier.
 *  4. Anything else proceeds without approval.
 */
export function evaluatePolicy(
  capability: Capability,
  context: InvocationContext,
): InvocationDecision {
  const durableGrant = context.policyGrants?.[capability.capabilityId] === true;

  if (STEP_UP_TIERS.has(capability.riskTier)) {
    if (!context.approvalGranted) {
      return {
        allowed: true,
        requiresApproval: true,
        approvalReason:
          capability.approval.reason ??
          `tier ${capability.riskTier} action requires confirmation and step-up authentication`,
      };
    }
    if (!context.stepUpCompleted) {
      return {
        allowed: false,
        error: 'STEP_UP_REQUIRED',
        detail: `${capability.capabilityId} is tier 4: step-up authentication required`,
      };
    }
    return { allowed: true, requiresApproval: false };
  }

  if (capability.riskTier === 3 || capability.approval.required) {
    if (durableGrant) {
      return { allowed: true, requiresApproval: false };
    }
    if (!context.approvalGranted) {
      return {
        allowed: true,
        requiresApproval: true,
        approvalReason:
          capability.approval.reason ??
          `tier ${capability.riskTier} action requires confirmation`,
      };
    }
    return { allowed: true, requiresApproval: false };
  }

  return { allowed: true, requiresApproval: false };
}

/**
 * Check an idempotency key against the store.
 * Returns the replayed result when the key was seen, undefined otherwise.
 * Throws IDEMPOTENCY_CONFLICT when the capability requires a key and none
 * was provided — fail closed, never execute twice.
 */
export async function checkIdempotency(
  capability: Capability,
  context: InvocationContext,
  store: IdempotencyStore,
): Promise<{ replay: boolean; result?: unknown }> {
  if (!capability.idempotency.required) {
    return { replay: false };
  }
  const key = context.idempotencyKey;
  if (!key) {
    throw new CapabilityError(
      'IDEMPOTENCY_CONFLICT',
      `${capability.capabilityId} requires an idempotency key but none was provided`,
    );
  }
  const namespaced = `${capability.capabilityId}.v${capability.version}:${key}`;
  const prior = await store.get(namespaced);
  if (prior !== undefined) {
    return { replay: true, result: prior };
  }
  return { replay: false };
}

/** Record a successful invocation result for idempotent replay. */
export async function recordIdempotency(
  capability: Capability,
  context: InvocationContext,
  store: IdempotencyStore,
  result: unknown,
): Promise<void> {
  if (!capability.idempotency.required || !context.idempotencyKey) return;
  const namespaced = `${capability.capabilityId}.v${capability.version}:${context.idempotencyKey}`;
  await store.set(namespaced, result, 24 * 3600);
}
