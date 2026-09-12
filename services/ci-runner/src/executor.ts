import type { CIJobConfig } from './parser.js';

export type JobStatus = 'pending' | 'running' | 'success' | 'failed';

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  status: 'success' | 'failed';
}

/** Infrastructure unavailability is not an allowed workflow-step failure. */
export class CIExecutorUnavailableError extends Error {
  readonly code = 'CI_EXECUTOR_UNAVAILABLE';

  constructor() {
    super('CI execution is unavailable: an isolated execution backend has not been configured.');
    this.name = 'CIExecutorUnavailableError';
  }
}

export class CIJobExecutor {
  private statusMap = new Map<string, JobStatus>();

  getStatus(jobName: string): JobStatus {
    return this.statusMap.get(jobName) ?? 'pending';
  }

  /** Check before accepting any run, including one with no executable jobs. */
  assertAvailable(): void {
    throw new CIExecutorUnavailableError();
  }

  async executeJob(job: CIJobConfig, _variables: Record<string, string>): Promise<ExecutionResult> {
    // Do not expand or print script variables, invent output, or claim a build
    // succeeded. A real isolated backend must supply an actual execution result.
    this.statusMap.set(job.name, 'failed');
    throw new CIExecutorUnavailableError();
  }
}
