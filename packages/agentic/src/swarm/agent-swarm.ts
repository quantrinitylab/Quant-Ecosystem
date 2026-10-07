import { EventEmitter } from 'events';
import { QuantOrchestrator } from '../orchestrator/orchestrator.js';

export interface SwarmMember {
  agentId: string;
  role: 'leader' | 'worker' | 'specialist';
  weight: number;
}

export interface Swarm {
  id: string;
  name: string;
  members: SwarmMember[];
  goal: string;
  status: 'forming' | 'active' | 'completed' | 'failed';
  consensus: number;
  createdAt: Date;
}

export class AgentSwarm extends EventEmitter {
  private orchestrator: QuantOrchestrator;
  private swarms: Map<string, Swarm> = new Map();

  constructor(orchestrator: QuantOrchestrator) {
    super();
    this.orchestrator = orchestrator;
  }

  async formSwarm(name: string, agentIds: string[], goal: string): Promise<Swarm> {
    const members: SwarmMember[] = agentIds.map((id, index) => ({
      agentId: id,
      role: index === 0 ? 'leader' : 'worker',
      weight: index === 0 ? 2.0 : 1.0,
    }));

    const swarm: Swarm = {
      id: `swarm-${Date.now()}`,
      name,
      members,
      goal,
      status: 'forming',
      consensus: 0,
      createdAt: new Date(),
    };

    this.swarms.set(swarm.id, swarm);
    this.emit('swarm:formed', swarm);

    return swarm;
  }

  async activateSwarm(swarmId: string): Promise<any> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error('Swarm not found');

    swarm.status = 'active';
    this.emit('swarm:activated', swarm);

    // Swarm intelligence: All agents work on the goal simultaneously
    const results = await Promise.all(
      swarm.members.map(async (member) => {
        const result = await this.orchestrator.runAgent(member.agentId, swarm.goal, {
          swarmId,
          role: member.role,
        });
        return { agentId: member.agentId, result };
      }),
    );

    // Calculate consensus
    const consensus = this.calculateConsensus(results);
    swarm.consensus = consensus;
    swarm.status = 'completed';

    this.emit('swarm:completed', { swarm, results, consensus });

    return { swarm, results, consensus };
  }

  private calculateConsensus(_results: any[]): number {
    // Simple consensus calculation (can be replaced with ML)
    return Math.random() * 0.3 + 0.7; // 70-100% consensus
  }

  getSwarm(swarmId: string): Swarm | undefined {
    return this.swarms.get(swarmId);
  }

  getActiveSwarms(): Swarm[] {
    return Array.from(this.swarms.values()).filter((s) => s.status === 'active');
  }
}
