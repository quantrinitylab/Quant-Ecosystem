import type { CIJobConfig } from './parser.js';
import { GVisorContainerExecutor } from './gvisor-executor.js';

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
  private gvisor: GVisorContainerExecutor;

  constructor(gvisor?: GVisorContainerExecutor) {
    this.gvisor = gvisor ?? new GVisorContainerExecutor();
  }

  getStatus(jobName: string): JobStatus {
    return this.statusMap.get(jobName) ?? 'pending';
  }

  /** Check before accepting any run, including one with no executable jobs. */
  assertAvailable(): void {
    this.gvisor.assertAvailable();
  }

  async executeJob(job: CIJobConfig, variables: Record<string, string>): Promise<ExecutionResult> {
    // If backend is unavailable, fail closed cleanly and mark job failed without inspecting variables
    if (!this.gvisor.isAvailable()) {
      this.statusMap.set(job.name, 'failed');
      throw new CIExecutorUnavailableError();
    }

    this.statusMap.set(job.name, 'running');

    try {
      const result = await this.gvisor.executeJob(job, variables);
      this.statusMap.set(job.name, result.status);
      return result;
    } catch (err) {
      this.statusMap.set(job.name, 'failed');
      throw err;
    }
  }
}

export { GVisorContainerExecutor };
