export interface AgentHealth {
  agentId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime: number;
  errorRate: number;
  uptime: number;
}

export class AgentHealthMonitor {
  private health: Map<string, AgentHealth> = new Map();

  updateHealth(agentId: string, responseTime: number, success: boolean) {
    const current = this.health.get(agentId) || {
      agentId,
      status: 'healthy' as const,
      lastCheck: new Date(),
      responseTime: 0,
      errorRate: 0,
      uptime: 100,
    };

    current.responseTime = (current.responseTime + responseTime) / 2;
    current.errorRate = success ? current.errorRate * 0.9 : Math.min(current.errorRate + 5, 100);

    current.lastCheck = new Date();

    // Determine status
    if (current.errorRate > 20 || current.responseTime > 5000) {
      current.status = 'unhealthy';
    } else if (current.errorRate > 5 || current.responseTime > 2000) {
      current.status = 'degraded';
    } else {
      current.status = 'healthy';
    }

    this.health.set(agentId, current);
  }

  getHealth(agentId: string): AgentHealth | undefined {
    return this.health.get(agentId);
  }

  getAllHealth(): AgentHealth[] {
    return Array.from(this.health.values());
  }
}

export const healthMonitor = new AgentHealthMonitor();
