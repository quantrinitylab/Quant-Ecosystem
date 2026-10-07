export * from './types';
export { PRODUCT_APPS, resolveApp } from './registry';
export { getApp, allApps, byCategory } from './queries';

// EC-01 — Ecosystem App Capability Registry (doc 21).
export * from './capability-types';
export { CAPABILITY_ERROR_CODES, CapabilityError } from './capability-errors';
export type { CapabilityErrorCode } from './capability-errors';
export { resolveVersion } from './capability-versioning';
export type { VersionResolution } from './capability-versioning';
export {
  evaluatePolicy,
  checkIdempotency,
  recordIdempotency,
  MemoryIdempotencyStore,
} from './capability-policy';
export type { IdempotencyStore } from './capability-policy';
export { CapabilityRegistry, validateDescriptor } from './capability-registry';
export type { RegistryHooks, RegistryOptions, AuditEntry } from './capability-registry';
export { projectForQuanty } from './quanty-projection';
export type { ProjectionPolicy } from './quanty-projection';
export { ALL_CAPABILITIES, buildCapabilityRegistry, activeCapabilities } from './capabilities';

// EC-02 — Cross-App Resource Contract & Context Envelope (doc 22).
export * from './resource-types';
export { RESOURCE_ERROR_CODES, ResourceContractError } from './resource-errors';
export type { ResourceErrorCode } from './resource-errors';
export {
  createResourceRef,
  tryCreateResourceRef,
  isResourceRef,
  parseResourceRef,
  serializeResourceRef,
  deserializeResourceRef,
  deepLinkFor,
  parseDeepLink,
  isStaleVersion,
  sameResource,
} from './resource-ref';
export {
  createContextEnvelope,
  isContextEnvelope,
  parseContextEnvelope,
  serializeEnvelope,
  deserializeEnvelope,
  assertBudget,
  assertTenantMatch,
  estimatePayloadBytes,
  isTierWithin,
  DEFAULT_ENVELOPE_BUDGET_BYTES,
} from './context-envelope';
