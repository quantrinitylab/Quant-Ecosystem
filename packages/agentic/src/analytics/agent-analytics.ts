export interface AgentUsage {
  agentId: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageResponseTime: number;
  lastUsed: Date;
}

export class AgentAnalytics {
  private usage: Map<string, AgentUsage> = new Map();

  recordRun(agentId: string, success: boolean, responseTime: number) {
    const current = this.usage.get(agentId) || {
      agentId,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageResponseTime: 0,
      lastUsed: new Date(),
    };

    current.totalRuns++;
    if (success) current.successfulRuns++;
    else current.failedRuns++;

    // Update average response time
    current.averageResponseTime =
      (current.averageResponseTime * (current.totalRuns - 1) + responseTime) / current.totalRuns;

    current.lastUsed = new Date();

    this.usage.set(agentId, current);
  }

  getAgentStats(agentId: string): AgentUsage | undefined {
    return this.usage.get(agentId);
  }

  getTopAgents(limit: number = 5): AgentUsage[] {
    return Array.from(this.usage.values())
      .sort((a, b) => b.totalRuns - a.totalRuns)
      .slice(0, limit);
  }

  getSuccessRate(agentId: string): number {
    const stats = this.usage.get(agentId);
    if (!stats || stats.totalRuns === 0) return 0;
    return (stats.successfulRuns / stats.totalRuns) * 100;
  }
}

export const analytics = new AgentAnalytics();
