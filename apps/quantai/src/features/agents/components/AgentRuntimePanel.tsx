'use client';

// ============================================================================
// quantai — minimal agent-runtime surface (DoD-3 concrete consumption)
// ============================================================================
//
// A small UI surface proving the seam end-to-end: it reads the running agents
// and starts a task purely through the `@quant/api-client` hooks (which hit the
// same-origin `/api/agents/runtime/*` proxies). There is NO inline fetch here —
// this is the sanctioned Layer-5 call path (Requirement 1.4 / DoD-3).

import { useState } from 'react';
import { useExecuteAgentTask, useRunningAgents } from '../useAgentRuntime';
import { planAgentTask } from '../agentTaskPlan';

export function AgentRuntimePanel() {
  const [task, setTask] = useState('');
  const runningAgents = useRunningAgents();
  const executeTask = useExecuteAgentTask();

  const agents =
    runningAgents.data?.success && runningAgents.data.data ? runningAgents.data.data.agents : [];
  const completedTask =
    executeTask.data?.success && executeTask.data.data ? executeTask.data.data : null;
  // Validate + schedule the decomposed subtask DAG via @quant/quanty-task-graph.
  const plan = completedTask ? planAgentTask(completedTask) : null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = task.trim();
    if (trimmed.length > 0) {
      executeTask.mutate({ task: trimmed });
    }
  };

  return (
    <section aria-label="Agent runtime">
      <h2>Agent Runtime</h2>

      <form onSubmit={handleSubmit}>
        <input
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="Describe a task for the agent runtime"
          aria-label="Agent task description"
        />
        <button type="submit" disabled={executeTask.isPending}>
          {executeTask.isPending ? 'Running…' : 'Run task'}
        </button>
      </form>

      {executeTask.data?.success && executeTask.data.data ? (
        <p>
          Task {executeTask.data.data.id}: {executeTask.data.data.status}
        </p>
      ) : null}

      {plan ? (
        <section aria-label="Execution plan">
          <h3>Execution plan</h3>
          {plan.ok ? (
            <ol>
              {plan.waves.map((wave, index) => (
                <li key={wave.join('|')}>
                  Wave {index + 1}: {wave.join(', ')}
                </li>
              ))}
            </ol>
          ) : (
            <ul>
              {plan.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {plan.warnings.length > 0 ? (
            <ul>
              {plan.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <h3>Running agents ({agents.length})</h3>
      <ul>
        {agents.map((agent) => (
          <li key={agent.id}>{agent.id}</li>
        ))}
      </ul>
    </section>
  );
}
