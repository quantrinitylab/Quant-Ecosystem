// ============================================================================
// QuantCode module — CI pipeline trigger/status (Pillar 2)
// quantmail-superhub · Task 10.2 (Requirement 6.5)
// ============================================================================
//
// PURPOSE
//   Implements the CI/CD half of the QuantCodeModule interface
//   (design §"INTERFACE QuantCodeModule"):
//
//       PROCEDURE triggerPipeline(repoId, ref, trigger) RETURNS PipelineRun
//       FUNCTION  getRunStatus(runId)                   RETURNS RunStatus
//
//   `triggerPipeline` records a durable `CIRun` (the PipelineRun) for a ref and
//   hands the run off to the `ci-runner` infra service for execution;
//   `getRunStatus` reports the run's current status plus a per-job breakdown
//   (Requirement 6.5).
//
//   The actual execution lives in the `ci-runner` worker (it consumes the
//   `ci-runs` queue, parses the pipeline config, and runs the jobs). That
//   dispatch side-effect is hidden behind the injectable `CiRunnerPort` seam so
//   that:
//     * the run-recording + status logic stays pure and unit-testable offline
//       (inject a fake port — no Redis / ci-runner needed), and
//     * production can swap in a queue-backed adapter that enqueues onto the
//       `ci-runs` queue (see `createQueueCiRunnerPort`) without touching this
//       service's policy code.
//   This mirrors the `GitServerPort` seam used by `GitService` (Task 10.1).

import type { PrismaClient, CiRun, CiJob } from '@prisma/client';
import { createAppError } from '@quant/server-core';

// ---------------------------------------------------------------------------
// Input / output contracts
// ---------------------------------------------------------------------------

/** What kicked off a pipeline run. */
export type PipelineTriggerType = 'PUSH' | 'PULL_REQUEST' | 'MANUAL' | 'AGENT';

/** Trigger metadata passed to `triggerPipeline`. */
export interface PipelineTrigger {
  type: PipelineTriggerType;
  /** Commit SHA to build. Falls back to the branch's recorded head when omitted. */
  commitSha?: string;
  /** The pull request this run is associated with, when triggered for a PR. */
  prId?: string;
  /** User/agent id that initiated the run (recorded on `CIRun.triggeredBy`). */
  triggeredBy?: string;
  /** Pipeline definition handed to ci-runner (YAML). */
  configYaml?: string;
  /** Variables interpolated into the pipeline config by ci-runner. */
  variables?: Record<string, string>;
}

/** A recorded pipeline run — the `CIRun` row. */
export type PipelineRun = CiRun;

/** The reported status of a run plus its per-job breakdown. */
export interface RunStatus {
  runId: string;
  repoId: string;
  prId: string | null;
  branch: string;
  commitSha: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  jobs: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

// ---------------------------------------------------------------------------
// Injectable port (seam for testability + ci-runner wiring)
// ---------------------------------------------------------------------------

/** Payload handed to `ci-runner` to execute a recorded run. */
export interface CiRunnerDispatch {
  runId: string;
  repoId: string;
  branch: string;
  commitSha: string;
  configYaml: string;
  variables?: Record<string, string>;
}

/**
 * Dispatch seam to the `ci-runner` infra service. The default in-process
 * adapter is a no-op (the recorded `CIRun` row is the durable artifact); the
 * production adapter (`createQueueCiRunnerPort`) enqueues onto the `ci-runs`
 * queue so the ci-runner worker picks the run up and executes it.
 */
export interface CiRunnerPort {
  dispatch(input: CiRunnerDispatch): Promise<void>;
}

/** Default offline adapter: records nothing extra and performs no transport. */
export const noopCiRunner: CiRunnerPort = {
  async dispatch() {
    /* no-op: the CIRun row is the durable PipelineRun; production swaps this. */
  },
};

/**
 * Minimal queue contract satisfied by `@quant/queue`'s `TypedQueue` (and by a
 * test double). Kept structural so this module does not hard-depend on the
 * queue package at the type level.
 */
export interface CiRunQueueLike {
  add(jobName: string, payload: CiRunnerDispatch, opts?: { jobId?: string }): Promise<string>;
}

/**
 * Production adapter factory: dispatch a run by enqueuing it onto the `ci-runs`
 * queue. The run id is used as the BullMQ job id so re-dispatching the same run
 * is idempotent at the queue level.
 */
export function createQueueCiRunnerPort(queue: CiRunQueueLike): CiRunnerPort {
  return {
    async dispatch(input) {
      await queue.add('ci-run', input, { jobId: input.runId });
    },
  };
}

export interface PipelineServiceOptions {
  ciRunner?: CiRunnerPort;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a full ref (`refs/heads/main`) to its short branch name (`main`). */
function refToBranch(ref: string): string {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PipelineService {
  private readonly ciRunner: CiRunnerPort;

  constructor(
    private readonly prisma: PrismaClient,
    options: PipelineServiceOptions = {},
  ) {
    this.ciRunner = options.ciRunner ?? noopCiRunner;
  }

  /**
   * Trigger a CI pipeline for a ref, recording a durable `PipelineRun` and
   * handing it off to ci-runner for execution.
   *
   * @throws 404 when the repository does not exist.
   * @throws 400 when no commit SHA can be resolved for the ref.
   */
  async triggerPipeline(
    repoId: string,
    ref: string,
    trigger: PipelineTrigger,
  ): Promise<PipelineRun> {
    const repo = await this.prisma.repository.findUnique({ where: { id: repoId } });
    if (!repo) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    const branch = refToBranch(ref);

    // Resolve the commit to build: explicit SHA wins, else the branch's head.
    let commitSha = trigger.commitSha;
    if (!commitSha) {
      const branchRow = await this.prisma.branch.findUnique({
        where: { repoId_name: { repoId, name: branch } },
      });
      commitSha = branchRow?.commitSha;
    }
    if (!commitSha) {
      throw createAppError(
        `Cannot resolve a commit for ref '${ref}'`,
        400,
        'CI_NO_COMMIT_FOR_REF',
      );
    }

    // Record the run (PENDING) — this row IS the PipelineRun returned to callers.
    const run = await this.prisma.ciRun.create({
      data: {
        repoId,
        prId: trigger.prId ?? null,
        branch,
        commitSha,
        status: 'PENDING',
        triggeredBy: trigger.triggeredBy ?? null,
      },
    });

    // Hand off to ci-runner for execution (no-op offline; queued in production).
    await this.ciRunner.dispatch({
      runId: run.id,
      repoId,
      branch,
      commitSha,
      configYaml: trigger.configYaml ?? '',
      variables: trigger.variables,
    });

    return run;
  }

  /**
   * Report the current status of a run plus its per-job breakdown.
   *
   * @throws 404 when the run does not exist.
   */
  async getRunStatus(runId: string): Promise<RunStatus> {
    const run = await this.prisma.ciRun.findUnique({
      where: { id: runId },
      include: { jobs: { orderBy: { createdAt: 'asc' } } },
    });

    if (!run) {
      throw createAppError('CI run not found', 404, 'CI_RUN_NOT_FOUND');
    }

    const jobs = (run as CiRun & { jobs: CiJob[] }).jobs;

    return {
      runId: run.id,
      repoId: run.repoId,
      prId: run.prId,
      branch: run.branch,
      commitSha: run.commitSha,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      jobs: jobs.map((job) => ({ id: job.id, name: job.name, status: job.status })),
    };
  }
}
