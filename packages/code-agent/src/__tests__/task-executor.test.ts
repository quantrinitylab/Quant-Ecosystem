import { TaskExecutor } from '../tasks/task-executor.js';
import { MockCodeSandbox } from '../sandbox/code-sandbox.js';
import { CodeTaskType, TaskState } from '../types.js';

describe('TaskExecutor', () => {
  let executor: TaskExecutor;
  let sandbox: MockCodeSandbox;

  beforeEach(() => {
    sandbox = new MockCodeSandbox();
    executor = new TaskExecutor(sandbox);
  });

  it('creates a task in planning state', () => {
    const task = executor.createTask('t1', CodeTaskType.implement, 'build x', 'feat/x');
    expect(task.state).toBe(TaskState.planning);
    expect(task.maxAttempts).toBe(3);
  });

  it('advances through state machine', () => {
    executor.createTask('t1', CodeTaskType.fix, 'fix y', 'fix/y');
    executor.advanceState('t1');
    expect(executor.getTask('t1')?.state).toBe(TaskState.editing);
    executor.advanceState('t1');
    expect(executor.getTask('t1')?.state).toBe(TaskState.testing);
    executor.advanceState('t1');
    expect(executor.getTask('t1')?.state).toBe(TaskState.reviewing);
    executor.advanceState('t1');
    expect(executor.getTask('t1')?.state).toBe(TaskState.complete);
  });

  it('throws on terminal state advance', () => {
    executor.createTask('t1', CodeTaskType.test, 'd', 'b');
    executor.getTask('t1')!.state = TaskState.complete;
    expect(() => executor.advanceState('t1')).toThrow('terminal');
  });

  it('handles test failure with retry', () => {
    executor.createTask('t1', CodeTaskType.implement, 'd', 'b', { maxAttempts: 2 });
    executor.handleTestFailure('t1');
    expect(executor.getTask('t1')?.state).toBe(TaskState.fixing);
    executor.handleTestFailure('t1');
    expect(executor.getTask('t1')?.state).toBe(TaskState.failed);
  });

  it('tracks tokens and detects over-budget', () => {
    executor.createTask('t1', CodeTaskType.refactor, 'd', 'b', { tokenBudget: 100 });
    executor.trackTokens('t1', 50);
    expect(executor.isOverBudget('t1')).toBe(false);
    executor.trackTokens('t1', 60);
    expect(executor.isOverBudget('t1')).toBe(true);
  });

  it('runTests delegates to sandbox', async () => {
    executor.createTask('t1', CodeTaskType.test, 'd', 'b');
    const result = await executor.runTests('t1', 'vitest', {
      timeoutMs: 5000,
      memoryMb: 512,
      cpuCores: 1,
      diskMb: 1024,
      networkAccess: false,
    });
    expect(result.exitCode).toBe(0);
  });
});
