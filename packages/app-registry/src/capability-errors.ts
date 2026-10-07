/**
 * EC-01 — Canonical capability errors (§11).
 *
 * The UI and Quanty must distinguish these states — every failure carries a
 * typed code, never a bare message.
 */

export const CAPABILITY_ERROR_CODES = [
  'CAPABILITY_NOT_FOUND',
  'CAPABILITY_VERSION_UNSUPPORTED',
  'CAPABILITY_DISABLED',
  'AUTH_REQUIRED',
  'SCOPE_DENIED',
  'RESOURCE_FORBIDDEN',
  'TENANT_MISMATCH',
  'APP_POLICY_DENIED',
  'APPROVAL_REQUIRED',
  'STEP_UP_REQUIRED',
  'IDEMPOTENCY_CONFLICT',
  'DEPENDENCY_UNAVAILABLE',
  'OPERATION_TIMEOUT_UNKNOWN',
  'VERIFICATION_FAILED',
  'COST_QUOTE_REQUIRED',
  'ECONOMY_RESERVATION_REQUIRED',
  'RESOURCE_STALE',
  'RESOURCE_DELETED',
] as const;

export type CapabilityErrorCode = (typeof CAPABILITY_ERROR_CODES)[number];

/** Typed registry error. `detail` carries context; never secrets or bodies. */
export class CapabilityError extends Error {
  readonly code: CapabilityErrorCode;
  readonly detail?: string;

  constructor(code: CapabilityErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'CapabilityError';
    this.code = code;
    this.detail = detail;
  }
}
