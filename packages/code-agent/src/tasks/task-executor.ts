import { CodeTask, CodeTaskType, TaskState, SandboxConfig } from '../types.js';
import { ICodeSandbox } from '../sandbox/code-sandbox.js';

const TRANSITIONS: Record<string, TaskState> = {
  planning: TaskState.editing,
  editing: TaskState.testing,
  testing: TaskState.reviewing,
  fixing: TaskState.testing,
  reviewing: TaskState.complete,
};

export class TaskExecutor {
  private tasks = new Map<string, CodeTask>();
  constructor(private sandbox: ICodeSandbox) {}

  createTask(
    id: string,
    type: CodeTaskType,
    description: string,
    branch: string,
    opts?: { maxAttempts?: number; tokenBudget?: number },
  ): CodeTask {
    const task: CodeTask = {
      id,
      type,
      description,
      branch,
      state: TaskState.planning,
      attempts: 0,
      maxAttempts: opts?.maxAttempts ?? 3,
      tokenBudget: opts?.tokenBudget ?? 100000,
      tokensUsed: 0,
    };
    this.tasks.set(id, task);
    return task;
  }
  getTask(id: string): CodeTask | undefined {
    return this.tasks.get(id);
  }

  advanceState(id: string): CodeTask {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    if (task.state === TaskState.complete || task.state === TaskState.failed)
      throw new Error(`Task ${id} is terminal`);
    const next = TRANSITIONS[task.state];
    if (!next) throw new Error(`No transition from ${task.state}`);
    task.state = next;
    return task;
  }
  async runTests(id: string, command: string, config: SandboxConfig) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    const result = await this.sandbox.execute(command, config);
    if (result.exitCode !== 0) {
      this.handleTestFailure(id);
    }
    return result;
  }
  handleTestFailure(id: string) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    task.attempts++;
    if (task.attempts >= task.maxAttempts) {
      task.state = TaskState.failed;
    } else {
      task.state = TaskState.fixing;
    }
  }
  trackTokens(id: string, tokens: number) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    task.tokensUsed += tokens;
  }
  isOverBudget(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    return task.tokensUsed >= task.tokenBudget;
  }
}
