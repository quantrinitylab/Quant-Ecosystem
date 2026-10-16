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
  CI_RUNS_QUEUE_NAME,
  CI_RUN_JOB_NAME,
  CiRunJobSchema,
  type CiRunJob,
} from './job-definitions.js';
export { QueueEvents } from 'bullmq';
export { QueueDeadLetter } from './dead-letter.js';
export type { DeadLetterRecord, DeadLetterFilters, DeadLetterStats } from './dead-letter.js';
export {
  createLogRedisPublisher,
  resolveLogRedisUrl,
  type LogRedisPublisher,
  type LogRedisPublisherOptions,
} from './redis-publisher.js';
