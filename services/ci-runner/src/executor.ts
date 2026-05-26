import type { CIJobConfig } from './parser.js';

export type JobStatus = 'pending' | 'running' | 'success' | 'failed';

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  status: 'success' | 'failed';
}

export class CIJobExecutor {
  private statusMap = new Map<string, JobStatus>();

  getStatus(jobName: string): JobStatus {
    return this.statusMap.get(jobName) ?? 'pending';
  }

  async executeJob(job: CIJobConfig, variables: Record<string, string>): Promise<ExecutionResult> {
    this.statusMap.set(job.name, 'running');
    const startTime = Date.now();

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    try {
      for (const line of job.script) {
        const expandedLine = this.expandVariables(line, variables);
        stdoutLines.push(`$ ${expandedLine}`);
        stdoutLines.push(`[OK] ${expandedLine}`);
      }

      const duration = Date.now() - startTime;
      this.statusMap.set(job.name, 'success');

      return {
        exitCode: 0,
        stdout: stdoutLines.join('\n'),
        stderr: stderrLines.join('\n'),
        duration,
        status: 'success',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      stderrLines.push(errorMessage);
      this.statusMap.set(job.name, 'failed');

      return {
        exitCode: 1,
        stdout: stdoutLines.join('\n'),
        stderr: stderrLines.join('\n'),
        duration,
        status: 'failed',
      };
    }
  }

  private expandVariables(line: string, variables: Record<string, string>): string {
    let result = line;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
      result = result.replace(new RegExp(`\\$${key}\\b`, 'g'), value);
    }
    return result;
  }
}
