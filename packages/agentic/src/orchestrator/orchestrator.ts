import { EventEmitter } from 'events';
import { Agent } from '../core/agent.js';
import { MemoryStore } from '../memory/memory-store.js';

export interface OrchestratorConfig {
  maxConcurrentAgents?: number;
  defaultModel?: string;
}

export class QuantOrchestrator extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private globalMemory: MemoryStore;

  constructor(_config: OrchestratorConfig = {}) {
    super();
    this.globalMemory = new MemoryStore('orchestrator');
  }

  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);

    // Forward agent events
    agent.on('task:completed', (task) => {
      this.emit('agent:task_completed', { agentId: agent.id, task });
    });

    this.emit('agent:registered', agent.id);
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  async runAgent(agentId: string, input: string, context?: any): Promise<any> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.isBusy()) {
      throw new Error(`Agent ${agentId} is currently busy`);
    }

    this.emit('orchestrator:agent_started', { agentId, input });

    const result = await agent.run(input, {
      ...context,
      orchestrator: this,
    });

    // Store in global memory
    await this.globalMemory.store({
      type: 'orchestrator_result',
      content: { agentId, input, result },
    });

    this.emit('orchestrator:agent_completed', { agentId, result });

    return result;
  }

  async runMultiAgent(task: string, agentIds: string[]): Promise<any> {
    const results = await Promise.all(
      agentIds.map((agentId) =>
        this.runAgent(agentId, task).catch((err) => ({ error: err.message })),
      ),
    );

    return {
      task,
      results,
      completedAt: new Date(),
    };
  }

  async broadcast(message: string, context?: any): Promise<any> {
    const promises = Array.from(this.agents.values()).map((agent) =>
      agent.run(message, context).catch((err) => ({ error: err.message })),
    );

    return Promise.all(promises);
  }

  getActiveAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  async shutdown(): Promise<void> {
    this.emit('orchestrator:shutdown');
  }
}
