/**
 * EC-02 — canonical error codes for the resource contract (doc 22 §16, §2).
 * Unknown app/resource types, malformed envelopes and budget violations
 * fail closed with typed errors — never silent nulls.
 */

export const RESOURCE_ERROR_CODES = {
  UNKNOWN_APP_ID: 'UNKNOWN_APP_ID',
  UNKNOWN_RESOURCE_TYPE: 'UNKNOWN_RESOURCE_TYPE',
  MALFORMED_RESOURCE_ID: 'MALFORMED_RESOURCE_ID',
  STALE_RESOURCE_VERSION: 'STALE_RESOURCE_VERSION',
  RESOURCE_DELETED: 'RESOURCE_DELETED',
  ENVELOPE_MALFORMED: 'ENVELOPE_MALFORMED',
  ENVELOPE_VERSION_UNSUPPORTED: 'ENVELOPE_VERSION_UNSUPPORTED',
  ENVELOPE_EXPIRED: 'ENVELOPE_EXPIRED',
  ENVELOPE_OVER_BUDGET: 'ENVELOPE_OVER_BUDGET',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  PURPOSE_NOT_ALLOWED: 'PURPOSE_NOT_ALLOWED',
  DEEP_LINK_INVALID: 'DEEP_LINK_INVALID',
  HANDOFF_MODE_INVALID: 'HANDOFF_MODE_INVALID',
  WORKFLOW_TRANSITION_INVALID: 'WORKFLOW_TRANSITION_INVALID',
  PROVENANCE_MISSING: 'PROVENANCE_MISSING',
  ACTOR_INVALID: 'ACTOR_INVALID',
  PAYLOAD_INVALID: 'PAYLOAD_INVALID',
  RESOURCE_MISMATCH: 'RESOURCE_MISMATCH',
} as const;

export type ResourceErrorCode =
  (typeof RESOURCE_ERROR_CODES)[keyof typeof RESOURCE_ERROR_CODES];

/** Typed contract error. `details` carries metadata only — never secret payloads. */
export class ResourceContractError extends Error {
  readonly code: ResourceErrorCode;
  readonly details?: Readonly<Record<string, string>>;

  constructor(code: ResourceErrorCode, message: string, details?: Record<string, string>) {
    super(message);
    this.name = 'ResourceContractError';
    this.code = code;
    this.details = details ? Object.freeze({ ...details }) : undefined;
  }
}
