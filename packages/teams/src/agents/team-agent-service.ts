import type { TeamAgent } from '../types.js';

export interface AgentExecution {
  id: string;
  agentId: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  timestamp: number;
}

export class TeamAgentService {
  private agents = new Map<string, TeamAgent>();
  private history = new Map<string, AgentExecution[]>();

  async create(orgId: string, name: string, capabilities: string[]): Promise<TeamAgent> {
    const agent: TeamAgent = {
      id: crypto.randomUUID(),
      orgId,
      name,
      capabilities,
      assignedTo: [],
      policy: '',
    };
    this.agents.set(agent.id, agent);
    this.history.set(agent.id, []);
    return agent;
  }

  async assign(agentId: string, userIds: string[]): Promise<TeamAgent | undefined> {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    agent.assignedTo = [...new Set([...agent.assignedTo, ...userIds])];
    return agent;
  }

  async setPolicy(agentId: string, policy: string): Promise<TeamAgent | undefined> {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    agent.policy = policy;
    return agent;
  }

  async getForOrg(orgId: string): Promise<TeamAgent[]> {
    const result: TeamAgent[] = [];
    for (const agent of this.agents.values()) {
      if (agent.orgId === orgId) result.push(agent);
    }
    return result;
  }

  async execute(agentId: string, task: string): Promise<AgentExecution | undefined> {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    const execution: AgentExecution = {
      id: crypto.randomUUID(),
      agentId,
      task,
      status: 'completed',
      result: `Executed: ${task}`,
      timestamp: Date.now(),
    };
    const agentHistory = this.history.get(agentId) ?? [];
    agentHistory.push(execution);
    this.history.set(agentId, agentHistory);
    return execution;
  }

  async getHistory(agentId: string): Promise<AgentExecution[]> {
    return this.history.get(agentId) ?? [];
  }
}
