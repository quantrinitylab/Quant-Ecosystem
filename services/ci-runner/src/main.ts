import { z } from 'zod';
import { createTypedWorker } from '@quant/queue';
import { CIConfigParser } from './parser.js';
import { CIJobExecutor } from './executor.js';
import { LogStreamer } from './log-streamer.js';

const CIRunJobSchema = z.object({
  runId: z.string(),
  repoId: z.string(),
  configYaml: z.string(),
  variables: z.record(z.string()).optional(),
});

export type CIRunJob = z.infer<typeof CIRunJobSchema>;

const parser = new CIConfigParser();
const executor = new CIJobExecutor();
const logStreamer = new LogStreamer();

export const ciWorker = createTypedWorker(
  'ci-runs',
  CIRunJobSchema,
  async (job) => {
    const { runId, configYaml, variables } = job.data;
    const config = parser.parseConfig(configYaml);
    const executionOrder = parser.getExecutionOrder(config);

    for (const stageJobs of executionOrder) {
      for (const jobName of stageJobs) {
        const jobConfig = config.jobs[jobName];
        if (!jobConfig) continue;

        logStreamer.startStreaming(`${runId}-${jobName}`);

        const result = await executor.executeJob(jobConfig, variables ?? {});

        for (const line of result.stdout.split('\n')) {
          logStreamer.appendLog(`${runId}-${jobName}`, line, 'stdout');
        }

        if (result.stderr) {
          for (const line of result.stderr.split('\n')) {
            logStreamer.appendLog(`${runId}-${jobName}`, line, 'stderr');
          }
        }

        logStreamer.endStreaming(`${runId}-${jobName}`);

        if (result.status === 'failed' && !jobConfig.allowFailure) {
          throw new Error(`Job ${jobName} failed with exit code ${result.exitCode}`);
        }
      }
    }
  },
  {
    connection: {
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    },
  },
);
