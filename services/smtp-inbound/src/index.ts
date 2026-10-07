// ============================================================================
// SMTP Inbound Service - Barrel Export
// ============================================================================

export { SmtpInboundServer, SmtpConfigSchema } from './smtp-server.js';
export type { SmtpConfig, ParsedEmail, EmailHandler } from './smtp-server.js';
export { EmailSender, SendEmailOptionsSchema } from './sender.js';
export type { SendEmailOptions, SendResult, EmailSenderConfig } from './sender.js';
export { createIngestionHandler, toIngestionPayload } from './ingestion-handler.js';
export type {
  IngestionHandlerOptions,
  IngestionPayload,
  Logger,
  FetchLike,
} from './ingestion-handler.js';
export { startService, loadServiceConfig } from './main.js';
export type { ServiceConfig } from './main.js';
