import { z } from 'zod';

export const SendEmailJobSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  templateId: z.string().optional(),
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
