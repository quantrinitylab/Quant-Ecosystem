// ============================================================================
// @quant/creator-economy — payouts/tax-reporting (DEPRECATED shim, K11)
// ============================================================================
//
// K11 (economy single-ownership): `TaxReportingService` moved to `@quant/payments`
// (`src/services/tax-reporting.service.ts`) per
// docs/quant-architecture/decisions/economy-single-ownership.md — tax metadata is
// a money-movement concern. This file is a back-compat re-export only; new code
// must import from `@quant/payments` directly. The class is unchanged, so
// existing consumers keep working without modification.
//
// Removal: Phase 4 of the migration plan (after zero importers remain).
// ============================================================================

/**
 * @deprecated Import from `@quant/payments` instead. This shim will be removed
 * in Phase 4 of the economy single-ownership migration.
 */
export { TaxReportingService } from '@quant/payments';
export type { Tax1099, WithholdingStatus } from '@quant/payments';
