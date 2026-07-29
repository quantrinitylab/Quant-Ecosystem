// ============================================================================
// @quant/database - Prisma Client, Repositories, and Schema Types
// ============================================================================

// Client
export { prisma, PrismaClient } from './client';
export type { Prisma } from './client';

// Prisma-generated model row types (re-exported so dependent packages consume
// them through the single database package rather than resolving their own
// @prisma/client variant).
export type {
  CreditLedgerEntry,
  PaymentRecord,
  PlanSubscription,
  OverageSetting,
  Payout,
  PlatformConfig,
  GameScore,
} from '@prisma/client';

// Transaction Helper
export { withTx } from './transaction';
export type { TransactionClient } from './transaction';

// Repositories
export {
  BaseRepository,
  UserRepository,
  MessageRepository,
  EmailRepository,
  PostRepository,
  MediaRepository,
  AISessionRepository,
  NotificationRepository,
  MemoryShadowReportRepository,
} from './repositories';
export type {
  PaginationOptions,
  PaginatedResult,
  MemoryShadowReportRow,
  CreateMemoryShadowReportInput,
  MemoryShadowReportPrismaClient,
  MemoryShadowReportWhere,
  ListMemoryShadowReportsOptions,
} from './repositories';

// Schema Types (kept as documentation/validation types)
export * from './schemas/users';
export * from './schemas/messages';
export * from './schemas/emails';
export * from './schemas/posts';
export * from './schemas/ads';
export * from './schemas/media';
export * from './schemas/profiles';
export * from './schemas/ai-sessions';
export * from './schemas/notifications';
