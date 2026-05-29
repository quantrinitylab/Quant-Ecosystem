import type { InformationAgent } from './types.js';

type AgentRunner = () => unknown;

export interface AgentRunResult<T = unknown> {
  result: T | null;
  error?: Error;
}

interface RegisteredAgent {
  agent: InformationAgent;
  runner: AgentRunner;
  nextRun: number;
  lastError?: Error;
}

export class AgentScheduler {
  private agents: Map<string, RegisteredAgent> = new Map();

  register(agent: InformationAgent, runner: AgentRunner): void {
    const frequency =
      'frequency' in agent.config ? (agent.config as { frequency: number }).frequency : 3600000;
    this.agents.set(agent.id, {
      agent,
      runner,
      nextRun: Date.now() + frequency,
    });
  }

  run(agentId: string): AgentRunResult {
    const entry = this.agents.get(agentId);
    if (!entry) {
      throw new Error(`Agent ${agentId} not found`);
    }
    entry.agent.status = 'running';
    entry.agent.lastRun = Date.now();
    try {
      const result = entry.runner();
      entry.agent.status = 'idle';
      entry.lastError = undefined;
      const frequency =
        'frequency' in entry.agent.config
          ? (entry.agent.config as { frequency: number }).frequency
          : 3600000;
      entry.nextRun = Date.now() + frequency;
      return { result };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      entry.agent.status = 'error';
      entry.lastError = error;
      return { result: null, error };
    }
  }

  runAll(): Map<string, AgentRunResult> {
    const results = new Map<string, AgentRunResult>();
    for (const agentId of this.agents.keys()) {
      results.set(agentId, this.run(agentId));
    }
    return results;
  }

  getSchedule(): Map<string, number> {
    const schedule = new Map<string, number>();
    for (const [id, entry] of this.agents) {
      schedule.set(id, entry.nextRun);
    }
    return schedule;
  }

  getAgent(agentId: string): InformationAgent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  getLastError(agentId: string): Error | undefined {
    return this.agents.get(agentId)?.lastError;
  }
}
