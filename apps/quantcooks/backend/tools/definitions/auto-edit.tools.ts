// ============================================================================
// QuantCooks CP-1 — Group E: auto-edit (tools 25–27, Tier A). Wraps
// services/auto-edit-orchestrator.service.ts + the preference delegate the
// routes use (there is no preference service; routes/auto-edit.ts reads
// prisma.autoEditPreference directly, and so does this executor — the
// same landed shape, not a re-implementation).
//
// Tool 25's adapter rule (§3.5): the orchestrator stays synchronous
// internally; the registry wraps one run in a unified EditJob (kind
// AUTO_EDIT) created QUEUED → claimed → COMPLETED/FAILED from the run
// summary, with externalRef = the AutoEditRun id and the run's outputUrl
// in `result`. Idempotency is the orchestrator's own (user, UTC day)
// key: a same-day re-invoke returns the existing run's job, never a
// second run. The orchestrator is constructed by deps exactly as the
// route constructs it (renderer from env flags, NO credits port — that
// wiring is CP-2's §6.5), so the job records creditCost 0 with
// metering 'not_wired', the §3.5-pinned pre-CP-2 surface.
// ============================================================================

import { z } from 'zod';
import type { ToolRegistry } from '../registry';
import { out, jobOut } from './shared';

const runInputSchema = z.object({
  sourceRef: z.string().max(2048).optional(),
  templateId: z.string().max(200).optional(),
  caption: z.string().max(2000).optional(),
});

const preferenceSchema = z.object({
  enabled: z.boolean(),
  sourceRef: z.string().max(2048).optional(),
  templateId: z.string().max(200).optional(),
  caption: z.string().max(2000).optional(),
});

interface AutoEditPreferencePrisma {
  autoEditPreference: {
    findUnique: (args: { where: { userId: string } }) => Promise<unknown>;
    upsert: (args: {
      where: { userId: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}

export function registerAutoEditTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.run_auto_edit',
    group: 'auto-edit',
    description:
      "Run the caller's daily auto-edit pipeline now (source → render → publish through the orchestrator's fail-closed ports). Async: returns an AUTO_EDIT job wrapping the run; a same-day re-invoke returns the existing run's job. Recorded price is 10 credits once CP-2 wires metering; until then the job states creditCost 0, metering 'not_wired'.",
    mode: 'async',
    tier: 'A',
    permissionTier: 2,
    inputSchema: runInputSchema,
    outputSchema: jobOut,
    example: { input: {} },
    execute: async (input, ctx, deps) => {
      const day = new Date().toISOString().slice(0, 10);
      const baseKey = ctx.idempotencyKey ?? `auto-edit:${ctx.actorUserId}:${day}`;

      let job = await deps.jobs.findByIdempotencyKey(ctx.actorUserId, baseKey);
      if (job && job.status !== 'FAILED') {
        return { job }; // QUEUED / PROCESSING / COMPLETED: the existing run's job
      }
      const idempotencyKey = job ? `${baseKey}:retry:${job.id}` : baseKey;
      job = await deps.jobs.createJob({
        userId: ctx.actorUserId,
        kind: 'AUTO_EDIT',
        toolName: 'quantcooks.run_auto_edit',
        params: input,
        idempotencyKey,
        creditCost: 0,
      });
      await deps.jobs.claimJob(job.id);

      try {
        const summary = await deps.orchestrator.runDaily(ctx.actorUserId, input);
        if (summary.status === 'completed') {
          const completed = await deps.jobs.completeJob(job.id, {
            externalRef: summary.id,
            result: {
              runId: summary.id,
              outputUrl: summary.outputUrl,
              postId: summary.postId,
              creditsCharged: summary.creditsCharged,
            },
          });
          return { job: completed ?? (await deps.jobs.getJob(job.id, ctx.actorUserId)) };
        }
        const failed = await deps.jobs.failJob(job.id, summary.error ?? 'AUTO_EDIT_RUN_FAILED');
        return { job: failed };
      } catch (err) {
        await deps.jobs.failJob(
          job.id,
          err instanceof Error ? err.message : 'AUTO_EDIT_RUN_FAILED',
        );
        throw err;
      }
    },
  });

  registry.register({
    name: 'quantcooks.get_auto_edit_preferences',
    group: 'auto-edit',
    description: "Read the caller's auto-edit opt-in preference ({ enabled: false } when never set). Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    inputSchema: z.object({}),
    outputSchema: out({ preference: z.unknown() }),
    example: { input: {}, output: { preference: { enabled: false } } },
    execute: async (input, ctx, deps) => {
      const prisma = deps.prisma as AutoEditPreferencePrisma;
      const pref = await prisma.autoEditPreference.findUnique({
        where: { userId: ctx.actorUserId },
      });
      return { preference: pref ?? { enabled: false } };
    },
  });

  registry.register({
    name: 'quantcooks.set_auto_edit_preference',
    group: 'auto-edit',
    description: "Set the caller's auto-edit opt-in and defaults (source, template, caption). Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    inputSchema: preferenceSchema,
    outputSchema: out({ preference: z.unknown() }),
    example: { input: { enabled: true }, output: { preference: { enabled: true } } },
    execute: async (input, ctx, deps) => {
      const prisma = deps.prisma as AutoEditPreferencePrisma;
      const fields = {
        enabled: input.enabled,
        sourceRef: input.sourceRef ?? null,
        templateId: input.templateId ?? null,
        caption: input.caption ?? null,
      };
      const preference = await prisma.autoEditPreference.upsert({
        where: { userId: ctx.actorUserId },
        update: fields,
        create: { userId: ctx.actorUserId, ...fields },
      });
      return { preference };
    },
  });
}
