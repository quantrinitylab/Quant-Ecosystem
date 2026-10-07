import { z } from 'zod';

export const SendEmailJobSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  templateId: z.string().optional(),
  // Additive context for the QuantMail OutboundDeliveryPipeline worker (durable delivery).
  // Optional so existing producers/consumers of SendEmailJob remain backward compatible.
  emailId: z.string().optional(),
  userId: z.string().optional(),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
});

export type SendEmailJob = z.infer<typeof SendEmailJobSchema>;

export const ProcessMediaJobSchema = z.object({
  fileKey: z.string(),
  userId: z.string(),
  type: z.enum(['video', 'image', 'audio']),
  options: z.record(z.string(), z.unknown()).optional(),
});

export type ProcessMediaJob = z.infer<typeof ProcessMediaJobSchema>;

export const SyncDataJobSchema = z.object({
  sourceApp: z.string(),
  targetApp: z.string(),
  entityType: z.string(),
  entityId: z.string(),
});

export type SyncDataJob = z.infer<typeof SyncDataJobSchema>;

export const GenerateReportJobSchema = z.object({
  reportType: z.string(),
  userId: z.string(),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }),
  format: z.enum(['pdf', 'csv', 'json']),
});

export type GenerateReportJob = z.infer<typeof GenerateReportJobSchema>;

export const ModerationJobSchema = z.object({
  contentId: z.string(),
  contentType: z.enum(['text', 'image', 'video', 'audio']),
  content: z.string(),
  userId: z.string(),
  appId: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ModerationJob = z.infer<typeof ModerationJobSchema>;

export const TranscodeJobSchema = z.object({
  inputPath: z.string(),
  outputDir: z.string(),
  userId: z.string(),
  videoId: z.string(),
  profiles: z
    .array(
      z.object({
        name: z.string(),
        width: z.number(),
        height: z.number(),
        videoBitrate: z.string(),
        audioBitrate: z.string(),
      }),
    )
    .optional(),
});

export type TranscodeJob = z.infer<typeof TranscodeJobSchema>;

export const ProactiveAgentJobSchema = z.object({
  jobType: z.enum([
    'meeting_reminder',
    'meeting_call_alert',
    'inbox_triage',
    'code_review_reminder',
    'daily_digest',
  ]),
  userId: z.string(),
  targetApp: z.string(),
  scheduledFor: z.string(),
  payload: z.record(z.string(), z.unknown()),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
});

export type ProactiveAgentJob = z.infer<typeof ProactiveAgentJobSchema>;
