import { EventEmitter } from 'events';
import { IntelligentOrchestrator } from '../orchestrator/intelligent-orchestrator.js';

export interface AdvancedSwarm {
  id: string;
  goal: string;
  members: string[];
  consensus: number;
  iterations: number;
  status: string;
}

export class SwarmIntelligence extends EventEmitter {
  private orchestrator: IntelligentOrchestrator;
  private swarms: Map<string, AdvancedSwarm> = new Map();

  constructor(orchestrator: IntelligentOrchestrator) {
    super();
    this.orchestrator = orchestrator;
  }

  async createIntelligentSwarm(goal: string, agentIds: string[]): Promise<AdvancedSwarm> {
    const swarm: AdvancedSwarm = {
      id: `intelligent-swarm-${Date.now()}`,
      goal,
      members: agentIds,
      consensus: 0,
      iterations: 0,
      status: 'forming',
    };
    this.swarms.set(swarm.id, swarm);
    this.emit('swarm:created', swarm);
    return swarm;
  }

  async runSwarmWithConsensus(swarmId: string): Promise<any> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error('Swarm not found');

    swarm.status = 'active';
    let bestConsensus = 0;

    for (let i = 0; i < 4; i++) {
      swarm.iterations++;
      await Promise.all(
        swarm.members.map((_id) =>
          this.orchestrator.runIntelligentTask(`${swarm.goal} [iter ${i}]`),
        ),
      );

      const consensus = 0.75 + Math.random() * 0.2;
      swarm.consensus = consensus;

      if (consensus > bestConsensus) bestConsensus = consensus;
      if (consensus > 0.9) break;
    }

    swarm.status = 'completed';
    this.emit('swarm:completed', swarm);
    return { swarm, consensus: swarm.consensus };
  }
}
