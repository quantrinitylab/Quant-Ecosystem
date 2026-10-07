import { QuantOrchestrator } from '../orchestrator/orchestrator.js';

export interface CollaborationSession {
  id: string;
  agents: string[];
  goal: string;
  status: 'active' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  results: any[];
}

export class AgentCollaboration {
  private orchestrator: QuantOrchestrator;
  private sessions: Map<string, CollaborationSession> = new Map();

  constructor(orchestrator: QuantOrchestrator) {
    this.orchestrator = orchestrator;
  }

  async startCollaboration(agents: string[], goal: string): Promise<CollaborationSession> {
    const session: CollaborationSession = {
      id: `collab-${Date.now()}`,
      agents,
      goal,
      status: 'active',
      startedAt: new Date(),
      results: [],
    };

    this.sessions.set(session.id, session);

    // Execute agents sequentially, passing context
    let context: any = { goal };

    for (const agentId of agents) {
      try {
        const result = await this.orchestrator.runAgent(agentId, goal, context);
        session.results.push({ agentId, result });
        context = { ...context, [agentId]: result };
      } catch (error) {
        session.status = 'failed';
        throw error;
      }
    }

    session.status = 'completed';
    session.completedAt = new Date();

    return session;
  }

  getSession(id: string): CollaborationSession | undefined {
    return this.sessions.get(id);
  }

  getActiveSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === 'active');
  }
}
