import type { InformationAgent } from './types.js';

type AgentRunner = () => unknown;

interface RegisteredAgent {
  agent: InformationAgent;
  runner: AgentRunner;
  nextRun: number;
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

  run(agentId: string): unknown {
    const entry = this.agents.get(agentId);
    if (!entry) {
      throw new Error(`Agent ${agentId} not found`);
    }
    entry.agent.status = 'running';
    entry.agent.lastRun = Date.now();
    try {
      const result = entry.runner();
      entry.agent.status = 'idle';
      const frequency =
        'frequency' in entry.agent.config
          ? (entry.agent.config as { frequency: number }).frequency
          : 3600000;
      entry.nextRun = Date.now() + frequency;
      return result;
    } catch {
      entry.agent.status = 'error';
      return null;
    }
  }

  runAll(): Map<string, unknown> {
    const results = new Map<string, unknown>();
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
}
