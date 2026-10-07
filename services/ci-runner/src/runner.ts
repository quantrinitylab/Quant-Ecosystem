import { CIConfigParser, type CIConfig, type CIJobConfig } from './parser.js';
import { CIJobExecutor, type ExecutionResult } from './executor.js';
import { LogStreamer } from './log-streamer.js';

export interface PipelineRunOptions {
  runId: string;
  repoId: string;
  configYaml: string;
  variables?: Record<string, string>;
}

export interface JobExecutionSummary {
  name: string;
  stage: string;
  status: 'success' | 'failed' | 'skipped';
  result?: ExecutionResult;
  allowFailure: boolean;
}

export interface PipelineRunResult {
  runId: string;
  status: 'success' | 'failed';
  jobs: Record<string, JobExecutionSummary>;
  duration: number;
}

/**
 * CI Workflow Pipeline Runner
 *
 * Coordinates parsing, topological stage execution order, isolated
 * gVisor execution, real-time log streaming, and failure policies.
 */
export class CIRunner {
  private parser: CIConfigParser;
  private executor: CIJobExecutor;
  private logStreamer: LogStreamer;

  constructor(
    options: {
      parser?: CIConfigParser;
      executor?: CIJobExecutor;
      logStreamer?: LogStreamer;
    } = {},
  ) {
    this.parser = options.parser ?? new CIConfigParser();
    this.executor = options.executor ?? new CIJobExecutor();
    this.logStreamer = options.logStreamer ?? new LogStreamer();
  }

  /**
   * Asserts isolated execution infrastructure is available.
   */
  assertAvailable(): void {
    this.executor.assertAvailable();
  }

  /**
   * Runs a complete CI pipeline from a workflow YAML definition.
   */
  async runPipeline(options: PipelineRunOptions): Promise<PipelineRunResult> {
    const startTime = Date.now();
    const { runId, configYaml, variables = {} } = options;

    // Reject entire run upfront if infrastructure is unavailable
    this.assertAvailable();

    const config: CIConfig = this.parser.parseConfig(configYaml);
    const executionOrder = this.parser.getExecutionOrder(config);
    const jobSummaries: Record<string, JobExecutionSummary> = {};

    let pipelineFailed = false;

    for (const stageJobs of executionOrder) {
      if (pipelineFailed) {
        // Mark subsequent stage jobs as skipped
        for (const jobName of stageJobs) {
          const jobConfig = config.jobs[jobName];
          if (jobConfig) {
            jobSummaries[jobName] = {
              name: jobName,
              stage: jobConfig.stage,
              status: 'skipped',
              allowFailure: Boolean(jobConfig.allowFailure),
            };
          }
        }
        continue;
      }

      for (const jobName of stageJobs) {
        const jobConfig: CIJobConfig | undefined = config.jobs[jobName];
        if (!jobConfig) continue;

        const streamKey = `${runId}-${jobName}`;
        this.logStreamer.startStreaming(streamKey);

        try {
          const result = await this.executor.executeJob(jobConfig, variables);

          // Stream output lines
          if (result.stdout) {
            for (const line of result.stdout.split('\n')) {
              this.logStreamer.appendLog(streamKey, line, 'stdout');
            }
          }
          if (result.stderr) {
            for (const line of result.stderr.split('\n')) {
              this.logStreamer.appendLog(streamKey, line, 'stderr');
            }
          }

          this.logStreamer.endStreaming(streamKey);

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
        } catch (err: any) {
          this.logStreamer.appendLog(streamKey, err.message || String(err), 'stderr');
          this.logStreamer.endStreaming(streamKey);

          jobSummaries[jobName] = {
            name: jobName,
            stage: jobConfig.stage,
            status: 'failed',
            allowFailure: Boolean(jobConfig.allowFailure),
          };

          if (!jobConfig.allowFailure) {
            pipelineFailed = true;
            throw err;
          }
        }
      }
    }

    const duration = Math.max(1, Date.now() - startTime);

    return {
      runId,
      status: pipelineFailed ? 'failed' : 'success',
      jobs: jobSummaries,
      duration,
    };
  }
}
