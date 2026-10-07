import { EventEmitter } from 'events';
import { Agent } from '../core/agent.js';
import { MemoryStore } from '../memory/memory-store.js';

export interface OrchestratorConfig {
  maxConcurrentAgents?: number;
  defaultModel?: string;
  enableSelfHealing?: boolean;
  enableFederation?: boolean;
}

export interface TaskDecomposition {
  subtasks: Array<{
    id: string;
    description: string;
    requiredCapabilities: string[];
    priority: number;
  }>;
  strategy: 'parallel' | 'sequential' | 'hybrid';
}

export class IntelligentOrchestrator extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private globalMemory: MemoryStore;
  private performanceMetrics: Map<string, number> = new Map();

  constructor(_config: OrchestratorConfig = {}) {
    super();
    this.globalMemory = new MemoryStore('intelligent-orchestrator');
  }

  registerAgent(agent: Agent, capabilities: string[] = []): void {
    this.agents.set(agent.id, agent);
    this.performanceMetrics.set(agent.id, 0.85);
    this.emit('agent:registered', { agentId: agent.id, capabilities });
  }

  getActiveAgents(): string[] {
    return Array.from(this.agents.keys());
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
    const result = await agent.run(input, { ...context, orchestrator: this });
    await this.globalMemory.store({
      type: 'orchestrator_result',
      content: { agentId, input, result },
    });
    this.emit('orchestrator:agent_completed', { agentId, result });
    return result;
  }

  async decomposeTask(task: string): Promise<TaskDecomposition> {
    return {
      subtasks: [
        {
          id: 'analyze',
          description: `Deep analysis: ${task}`,
          requiredCapabilities: ['analysis'],
          priority: 1,
        },
        {
          id: 'execute',
          description: `Core execution: ${task}`,
          requiredCapabilities: ['execution'],
          priority: 2,
        },
        {
          id: 'validate',
          description: `Validation & optimization: ${task}`,
          requiredCapabilities: ['validation'],
          priority: 3,
        },
      ],
      strategy: 'parallel',
    };
  }

  async selectBestAgents(_capabilities: string[], count: number = 3): Promise<string[]> {
    return Array.from(this.agents.keys()).slice(0, count);
  }

  async runIntelligentTask(task: string): Promise<any> {
    const decomp = await this.decomposeTask(task);
    const selected = await this.selectBestAgents(['execution'], decomp.subtasks.length);

    const results = await Promise.all(
      decomp.subtasks.map((sub, i) => {
        const agentId = selected[i % selected.length] ?? '';
        return this.agents.get(agentId)?.run(sub.description) || null;
      }),
    );

    const final = { task, decomposition: decomp, results, version: '2.1' };
    await this.globalMemory.store({ type: 'intelligent_result', content: final });
    return final;
  }

  getPerformanceReport() {
    return {
      agents: this.agents.size,
      avgPerformance:
        Array.from(this.performanceMetrics.values()).reduce((a, b) => a + b, 0) /
        this.performanceMetrics.size,
    };
  }
}
