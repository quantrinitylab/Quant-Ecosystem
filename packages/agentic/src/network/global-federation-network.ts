import { EventEmitter } from 'events';
import { IntelligentOrchestrator } from '../orchestrator/intelligent-orchestrator.js';

export interface FederationNode {
  id: string;
  region: string;
  url: string;
  health: number;
  capabilities: string[];
  lastPing: Date;
}

export class GlobalFederationNetwork extends EventEmitter {
  private orchestrator: IntelligentOrchestrator;
  private nodes: Map<string, FederationNode> = new Map();
  private networkId: string;

  constructor(orchestrator: IntelligentOrchestrator) {
    super();
    this.orchestrator = orchestrator;
    this.networkId = `network-${Date.now()}`;
    this.registerDefaultNodes();
  }

  private registerDefaultNodes() {
    this.nodes.set('us-east', {
      id: 'us-east',
      region: 'us-east-1',
      url: 'https://us-east.quant-ecosystem.ai',
      health: 0.98,
      capabilities: ['ml', 'orchestration', 'economy'],
      lastPing: new Date(),
    });
    this.nodes.set('eu-west', {
      id: 'eu-west',
      region: 'eu-west-1',
      url: 'https://eu-west.quant-ecosystem.ai',
      health: 0.95,
      capabilities: ['federation', 'training'],
      lastPing: new Date(),
    });
    this.nodes.set('ap-south', {
      id: 'ap-south',
      region: 'ap-south-1',
      url: 'https://ap-south.quant-ecosystem.ai',
      health: 0.92,
      capabilities: ['marketplace', 'reputation'],
      lastPing: new Date(),
    });
  }

  async broadcastToNetwork(task: string, regions: string[] = []): Promise<any> {
    const targetNodes =
      regions.length > 0
        ? Array.from(this.nodes.values()).filter((n) => regions.includes(n.region))
        : Array.from(this.nodes.values());

    const results = await Promise.all(
      targetNodes.map(async (node) => {
        const result = await this.orchestrator.runIntelligentTask(`${task} [via ${node.region}]`);
        return { region: node.region, result, health: node.health };
      }),
    );

    this.emit('network:broadcast', { task, results });
    return { task, networkResults: results, networkId: this.networkId };
  }

  getHealthyNodes(): FederationNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.health > 0.9);
  }

  async pingAllNodes(): Promise<any> {
    const pings = Array.from(this.nodes.values()).map((node) => ({
      region: node.region,
      health: node.health,
      lastPing: node.lastPing,
    }));
    return { networkId: this.networkId, nodes: pings };
  }
}
