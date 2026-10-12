import { describe, expect, it } from 'vitest';

import { planAgentTask } from '../features/agents/agentTaskPlan';
import type { AgentSubTask, AgentTask } from '../features/agents/types';

function makeTask(subtasks: AgentSubTask[], id = 'task-12345678'): AgentTask {
  return {
    id,
    description: 'Do the thing',
    status: 'completed',
    subtasks,
    startedAt: 0,
    completedAt: 1,
  };
}

function sub(
  id: string,
  description: string,
  dependencies: string[] = [],
): AgentSubTask {
  return { id, description, requiredPermission: 'read', dependencies };
}

describe('planAgentTask', () => {
  it('schedules a linear dependency chain into ordered waves', () => {
    const plan = planAgentTask(
      makeTask([
        sub('aaaaaaaa', 'first'),
        sub('bbbbbbbb', 'second', ['aaaaaaaa']),
        sub('cccccccc', 'third', ['bbbbbbbb']),
      ]),
    );
    expect(plan.ok).toBe(true);
    expect(plan.errors).toEqual([]);
    expect(plan.waves).toEqual([['first'], ['second'], ['third']]);
  });

  it('puts independent subtasks in a single wave', () => {
    const plan = planAgentTask(
      makeTask([sub('aaaaaaaa', 'one'), sub('bbbbbbbb', 'two')]),
    );
    expect(plan.ok).toBe(true);
    expect(plan.waves).toEqual([['one', 'two']]);
  });

  it('fail-closes on a dependency cycle', () => {
    const plan = planAgentTask(
      makeTask([
        sub('aaaaaaaa', 'one', ['bbbbbbbb']),
        sub('bbbbbbbb', 'two', ['aaaaaaaa']),
      ]),
    );
    expect(plan.ok).toBe(false);
    expect(plan.errors.length).toBeGreaterThan(0);
    expect(plan.waves).toEqual([]);
  });

  it('normalizes short backend ids deterministically', () => {
    const a = planAgentTask(makeTask([sub('x', 'solo')], 't1'));
    const b = planAgentTask(makeTask([sub('x', 'solo')], 't1'));
    expect(a.ok).toBe(true);
    expect(a).toEqual(b);
  });

  it('handles an empty subtask list', () => {
    const plan = planAgentTask(makeTask([]));
    expect(plan.ok).toBe(true);
    expect(plan.waves).toEqual([]);
  });

  it('handles a diamond dependency shape', () => {
    const plan = planAgentTask(
      makeTask([
        sub('aaaaaaaa', 'root'),
        sub('bbbbbbbb', 'left', ['aaaaaaaa']),
        sub('cccccccc', 'right', ['aaaaaaaa']),
        sub('dddddddd', 'join', ['bbbbbbbb', 'cccccccc']),
      ]),
    );
    expect(plan.ok).toBe(true);
    expect(plan.waves).toEqual([
      ['root'],
      ['left', 'right'],
      ['join'],
    ]);
  });
});
