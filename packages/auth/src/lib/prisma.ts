/**
 * K8 consolidation — single PrismaClient owner.
 *
 * Per the charter ("one authoritative owner" per source of truth),
 * `@quant/database` (`packages/database/src/client.ts`) is the sole owner of
 * the PrismaClient singleton. This module no longer instantiates its own
 * client; it re-exports the database package's singleton so existing
 * `@quant/auth` consumers (named and default imports) keep working unchanged.
 *
 * Note: the dev-mode log verbosity now follows `@quant/database`'s config
 * (`['query', 'info', 'warn', 'error']` instead of this module's former
 * `['query', 'error', 'warn']`). Production behavior is identical (`['error']`),
 * and the global-cache key (`globalThis.prisma`) is unchanged, so there is
 * still exactly one client instance per process.
 */
export { prisma } from '@quant/database';
import { prisma } from '@quant/database';

export default prisma;
