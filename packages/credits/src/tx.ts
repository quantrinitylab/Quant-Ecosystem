// ============================================================================
// @quant/credits — transaction-runner type
// ============================================================================
//
// The minimal shape of Prisma's interactive-transaction entry point used by the
// credits subsystem to settle multi-leg ledger movements atomically. Kept local
// so the package does not need to import the concrete PrismaClient value.

export type TransactionRunner = <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
