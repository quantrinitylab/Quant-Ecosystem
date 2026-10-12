/**
 * QM-QUANTY-004 — Unknown-outcome verification.
 *
 * Doc 28 §Unknown outcomes: "Timeout after a mutation creates unknown_outcome,
 * not failure. The verification adapter queries authoritative state before
 * retrying to avoid duplicates."
 *
 * This module implements the verify-before-retry policy around a host-supplied
 * VerificationAdapter (which must query the product's source of truth, never a
 * cache, keyed by idempotency key).
 */

import type { Capability } from '@quant/app-registry';
import type { VerificationAdapter } from './types';

export type UnknownOutcomeResolution =
  | { outcome: 'verified'; detail: string }
  | { outcome: 'absent'; detail: string }
  | { outcome: 'still_unknown'; detail: string };

/**
 * Resolve an 'unknown' node outcome:
 *  1. Ask the verification adapter for authoritative state.
 *  2. 'verified' → treat the mutation as completed (no retry — avoids dupes).
 *  3. 'absent'   → safe to retry with the SAME idempotency key.
 *  4. 'unknown'  → stays unknown; surfaced to the user, never auto-retried
 *                   blindly (a blind retry could double-apply the side effect).
 */
export async function resolveUnknownOutcome(
  capability: Capability,
  idempotencyKey: string,
  adapter: VerificationAdapter,
  signal: AbortSignal,
): Promise<UnknownOutcomeResolution> {
  let verdict: 'verified' | 'absent' | 'unknown';
  try {
    verdict = await adapter.verify(capability, idempotencyKey, signal);
  } catch (err) {
    return {
      outcome: 'still_unknown',
      detail: `verification adapter threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  switch (verdict) {
    case 'verified':
      return {
        outcome: 'verified',
        detail: `authoritative state confirms ${capability.capabilityId} applied (idempotency key ${idempotencyKey}) — no retry`,
      };
    case 'absent':
      return {
        outcome: 'absent',
        detail: `authoritative state shows ${capability.capabilityId} did NOT apply — safe to retry with the same idempotency key`,
      };
    case 'unknown':
      return {
        outcome: 'still_unknown',
        detail: `authoritative state inconclusive for ${capability.capabilityId} — leaving 'unknown', no blind retry`,
      };
  }
}

/**
 * Decide whether a node may be retried after a failure/unknown outcome.
 * Mutating nodes require idempotency; unknown outcomes require a
 * verification pass first (handled by the executor via resolveUnknownOutcome).
 */
export function mayRetry(args: {
  attempt: number;
  maxRetries: number;
  idempotencyRequired: boolean;
  idempotencyKeyPresent: boolean;
}): { allowed: boolean; reason: string } {
  if (args.attempt > args.maxRetries) {
    return { allowed: false, reason: `attempt ${args.attempt} exceeds maxRetries ${args.maxRetries}` };
  }
  if (args.idempotencyRequired && !args.idempotencyKeyPresent) {
    return { allowed: false, reason: 'retry of a mutating node requires an idempotency key' };
  }
  return { allowed: true, reason: 'retry permitted' };
}
