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
