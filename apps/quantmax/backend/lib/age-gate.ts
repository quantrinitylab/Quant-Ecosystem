// ============================================================================
// QuantMax - Age gate (18+ for the dating / adult random-chat surfaces)
// ============================================================================
//
// QuantMax's dating and random-video surfaces are adult-only. The authoritative
// age comes from the user's stored date of birth (User.dateOfBirth) — never a
// client-supplied number. These pure helpers compute the age and enforce the
// minimum, so the policy is deterministic and unit-testable.

import { createAppError } from '@quant/server-core';

/** Minimum age to enter the dating / adult random-chat pool. */
export const MIN_DATING_AGE = 18;

/** Whole years between `dob` and `now` (calendar-accurate). */
export function computeAge(dob: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Assert the user is old enough for an adult surface, returning their computed
 * age. A missing date of birth means age was never verified.
 *
 * @throws 403 AGE_VERIFICATION_REQUIRED  when `dob` is null/invalid.
 * @throws 403 UNDERAGE                    when the computed age is below the min.
 */
export function assertMinAge(
  dob: Date | string | null | undefined,
  minAge: number = MIN_DATING_AGE,
  now: Date = new Date(),
): number {
  if (dob == null) {
    throw createAppError(
      'Age verification is required for this feature',
      403,
      'AGE_VERIFICATION_REQUIRED',
    );
  }
  const date = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(date.getTime())) {
    throw createAppError(
      'Age verification is required for this feature',
      403,
      'AGE_VERIFICATION_REQUIRED',
    );
  }
  const age = computeAge(date, now);
  if (age < minAge) {
    throw createAppError(`You must be at least ${minAge} to use this feature`, 403, 'UNDERAGE');
  }
  return age;
}
