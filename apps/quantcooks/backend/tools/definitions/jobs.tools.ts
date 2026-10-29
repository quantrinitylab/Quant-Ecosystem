// ============================================================================
// QuantCooks CP-1 — Group F: jobs & export (tools 28–30, Tier A). Wraps
// the unified JobService (tools/jobs.ts) + P0-4's export stack: an
// EXPORT job created here is claimed by the same ExportProcessor that
// serves the legacy REST routes, because both persist on EditJob (the
// legacy surface folds in through the delegate adapter). Non-mp4 formats
// terminate FAILED with EXPORT_FORMAT_NOT_SUPPORTED in the processor,
// exactly as P0-4 specifies — the accepted enum is not narrowed and no
// render is faked.
// ============================================================================

import { z } from 'zod';
import type { ToolRegistry } from '../registry';
import { jobOut } from './shared';

export function registerJobTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.export_project',
    group: 'jobs',
    description:
      'Queue an export render of a project (async: returns an EXPORT job; poll get_job_status). Exports of the caller’s own project are free.',
    mode: 'async',
    tier: 'A',
    permissionTier: 1,
    inputSchema: z.object({
      projectId: z.string().min(1),
      format: z.enum(['mp4', 'webm', 'mov', 'gif', 'png', 'jpg']).optional().default('mp4'),
      resolution: z.enum(['720p', '1080p', '4k', 'original']).optional().default('1080p'),
      quality: z.enum(['low', 'medium', 'high', 'lossless']).optional().default('high'),
    }),
    outputSchema: jobOut,
    example: { input: { projectId: 'proj_1' } },
    execute: async (input, ctx, deps) => {
      const job = await deps.jobs.createJob({
        userId: ctx.actorUserId,
        projectId: input.projectId,
        kind: 'EXPORT',
        toolName: 'quantcooks.export_project',
        params: {
          format: input.format,
          resolution: input.resolution,
          quality: input.quality,
        },
        idempotencyKey: ctx.idempotencyKey,
        quoteId: ctx.quoteId ?? null,
      });
      return { job };
    },
  });

  registry.register({
    name: 'quantcooks.get_job_status',
    group: 'jobs',
    description:
      'The single status tool for EVERY async kind (export, generation, Craft render, photo edit, analysis, training, pipeline, auto-edit). Owner-scoped; another user’s job is a 404. Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    inputSchema: z.object({ jobId: z.string().min(1) }),
    outputSchema: jobOut,
    example: { input: { jobId: 'job_1' } },
    execute: async (input, ctx, deps) => {
      const job = await deps.jobs.getJob(input.jobId, ctx.actorUserId);
      return { job };
    },
  });

  registry.register({
    name: 'quantcooks.cancel_job',
    group: 'jobs',
    description:
      'Cancel a QUEUED job (it terminates FAILED with USER_CANCELLED; it was never charged). A PROCESSING or finished job refuses with CANNOT_CANCEL_JOB. Tier-2: agent surfaces must confirm first. Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 2,
    inputSchema: z.object({ jobId: z.string().min(1) }),
    outputSchema: jobOut,
    example: { input: { jobId: 'job_1' } },
    execute: async (input, ctx, deps) => {
      const job = await deps.jobs.cancelJob(input.jobId, ctx.actorUserId);
      return { job };
    },
  });
}
