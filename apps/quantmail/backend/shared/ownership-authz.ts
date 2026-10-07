// ============================================================================
// Shared — neutral ownership/tenant authorization filter (compat shim).
// quantmail-superhub
// ============================================================================
//
// The canonical ownership/tenant authorization filter was moved into the
// app-agnostic `@quant/credits` package (it is a pure, domain-free policy the
// credits subsystem depends on). This shim re-exports it so the mail domain's
// other consumers (the Answer Engine retriever, the Agent Runtime) keep
// importing `../../../shared/ownership-authz` unchanged.

export { ownerOnlyAuthz, createMailDomainOwnershipAuthz, assertOwnership } from '@quant/credits';
export type { OwnershipPrincipal, OwnedResource, OwnershipAuthzPort } from '@quant/credits';
