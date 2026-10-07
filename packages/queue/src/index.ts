export { TypedQueue, type TypedQueueOptions } from './queue-manager.js';
export { createTypedWorker, type TypedWorkerOptions, type TypedJob } from './worker-factory.js';
export type { Worker } from 'bullmq';
export {
  SendEmailJobSchema,
  type SendEmailJob,
  ProcessMediaJobSchema,
  type ProcessMediaJob,
  SyncDataJobSchema,
  type SyncDataJob,
  GenerateReportJobSchema,
  type GenerateReportJob,
  ModerationJobSchema,
  type ModerationJob,
  ProactiveAgentJobSchema,
  type ProactiveAgentJob,
} from './job-definitions.js';
export { QueueDeadLetter } from './dead-letter.js';
export type { DeadLetterRecord, DeadLetterFilters, DeadLetterStats } from './dead-letter.js';
