import { z } from 'zod';
import { createTypedWorker, createLogRedisPublisher } from '@quant/queue';
import { startHealthServer } from '@quant/health-server';
import { CIConfigParser } from './parser.js';
import { CIJobExecutor } from './executor.js';
import { LogStreamer } from './log-streamer.js';
import { type JobExecutionSummary, type PipelineRunResult } from './runner.js';

const CIRunJobSchema = z.object({
  runId: z.string(),
  repoId: z.string(),
  configYaml: z.string(),
  variables: z.record(z.string(), z.string()).optional(),
});

export type CIRunJob = z.infer<typeof CIRunJobSchema>;

const parser = new CIConfigParser();
const executor = new CIJobExecutor();
// fix/qm-ci-logs-redis-publish: the LogStreamer already knew how to publish
// batched logs to channel:ci:build:<buildId>:logs, but it was constructed with
// no publisher, so no build ever emitted anything and the SSE logs endpoint
// had nothing to stream. Wire a real Redis publisher in.
const logPublisher = createLogRedisPublisher();
const logStreamer = new LogStreamer({ redisPublisher: logPublisher });

// Release the Redis connection on shutdown; the BullMQ worker owns its own.
const shutdownLogPublisher = () => {
  void logPublisher.close();
};
process.once('SIGTERM', shutdownLogPublisher);
process.once('SIGINT', shutdownLogPublisher);

export const ciWorker = createTypedWorker(
  'ci-runs',
  CIRunJobSchema,
  async (job): Promise<PipelineRunResult> => {
    // Missing execution infrastructure must reject the whole run before parsing
    // or logging. Empty workflows and allowFailure cannot turn it into success.
    executor.assertAvailable();
    const { runId, configYaml, variables } = job.data;
    const config = parser.parseConfig(configYaml);
    const executionOrder = parser.getExecutionOrder(config);
    // Executable jobs only: a stage entry without a job config is skipped, so
    // the terminal marker must be anchored to the last job that actually runs.
    const executableJobNames = executionOrder.flat().filter((n) => config.jobs[n]);

    // fix/qm-quantgit-cijob-persist: collect per-job summaries and RETURN them
    // as the BullMQ job's return value (PipelineRunResult) instead of throwing
    // on the first hard job failure. The runner never touches the DB by
    // design; the backend's ci-runs queue-events listener persists these
    // summaries as CiJob rows + logs from the 'completed' event's return
    // value. Throwing here would discard every job's result and leave the
    // per-job breakdown empty for exactly the failed runs users inspect.
    // Unexpected executor exceptions (infra errors with no per-job data)
    // still throw, preserving the 'failed' event path for those.
    const startTime = Date.now();
    const jobSummaries: Record<string, JobExecutionSummary> = {};
    let pipelineFailed = false;

    const recordSkipped = (jobName: string): void => {
      const jobConfig = config.jobs[jobName];
      if (!jobConfig) return;
      jobSummaries[jobName] = {
        name: jobName,
        stage: jobConfig.stage,
        status: 'skipped',
        allowFailure: Boolean(jobConfig.allowFailure),
      };
    };

    try {
      let jobIndex = 0;
      for (const stageJobs of executionOrder) {
        for (const jobName of stageJobs) {
          const jobConfig = config.jobs[jobName];
          if (!jobConfig) continue;

          if (pipelineFailed) {
            // An earlier hard failure: this job never ran — record it as
            // skipped so the per-job breakdown stays complete and honest.
            recordSkipped(jobName);
            jobIndex += 1;
            continue;
          }

          // Only the last job's end is terminal: ending the stream early on a
          // non-final job would close subscribers' live view mid-build.
          const isLastJob = jobIndex === executableJobNames.length - 1;
          jobIndex += 1;
          const streamId = `${runId}-${jobName}`;

          // Pass runId explicitly as the build id: the streamer's fallback
          // splits the stream id on the last dash, which mangles job names
          // that contain dashes (publishing to a channel nobody subscribes to).
          logStreamer.startStreaming(streamId, runId);

          const result = await executor.executeJob(jobConfig, variables ?? {});

          for (const line of result.stdout.split('\n')) {
            logStreamer.appendLog(streamId, line, 'stdout');
          }

          if (result.stderr) {
            for (const line of result.stderr.split('\n')) {
              logStreamer.appendLog(streamId, line, 'stderr');
            }
          }

          logStreamer.endStreaming(streamId, { terminal: isLastJob });

          jobSummaries[jobName] = {
            name: jobName,
            stage: jobConfig.stage,
            status: result.status,
            result,
            allowFailure: Boolean(jobConfig.allowFailure),
          };

          if (result.status === 'failed' && !jobConfig.allowFailure) {
            pipelineFailed = true;
          }
        }
      }
    } catch (err) {
      // A failed build must still terminate the live log stream, otherwise SSE
      // subscribers hang on "live" forever. The per-job end above already ran
      // for the failed job (with terminal: false when it wasn't the last).
      await logStreamer.publishTerminal(runId);
      throw err;
    }

    if (pipelineFailed) {
      // The loop above only marks terminal on the last *executed* job's end,
      // which never ran for a failed pipeline — terminate the live stream.
      await logStreamer.publishTerminal(runId);
    }

    const duration = Math.max(1, Date.now() - startTime);
    return {
      runId,
      status: pipelineFailed ? 'failed' : 'success',
      jobs: jobSummaries,
      duration,
    };
  },
  {
    connection: {
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    },
  },
);

// Start health server for liveness/readiness probes
const healthPort = Number(process.env['HEALTH_PORT'] ?? '3021');
void startHealthServer(healthPort);
