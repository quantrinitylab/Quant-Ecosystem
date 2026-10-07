import { EventEmitter } from 'events';

export interface AgentReputation {
  agentId: string;
  score: number;
  successfulTasks: number;
  failedTasks: number;
  trustLevel: 'low' | 'medium' | 'high' | 'verified';
  lastUpdated: Date;
}

export class AgentReputationSystem extends EventEmitter {
  private reputations: Map<string, AgentReputation> = new Map();

  recordTask(agentId: string, success: boolean) {
    let rep = this.reputations.get(agentId);
    if (!rep) {
      rep = {
        agentId,
        score: 0.7,
        successfulTasks: 0,
        failedTasks: 0,
        trustLevel: 'medium',
        lastUpdated: new Date(),
      };
      this.reputations.set(agentId, rep);
    }

    if (success) {
      rep.successfulTasks++;
      rep.score = Math.min(rep.score + 0.02, 1.0);
    } else {
      rep.failedTasks++;
      rep.score = Math.max(rep.score - 0.05, 0.1);
    }

    rep.trustLevel =
      rep.score > 0.9 ? 'verified' : rep.score > 0.75 ? 'high' : rep.score > 0.5 ? 'medium' : 'low';
    rep.lastUpdated = new Date();

    this.emit('reputation:updated', rep);
    return rep;
  }

  getReputation(agentId: string): AgentReputation | undefined {
    return this.reputations.get(agentId);
  }

  getTopAgents(count: number = 5): AgentReputation[] {
    return Array.from(this.reputations.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }
}
