import { EventEmitter } from 'events';
import { IntelligentOrchestrator } from '../orchestrator/intelligent-orchestrator.js';

export interface AgentListing {
  id: string;
  name: string;
  capabilities: string[];
  price: number;
  rating: number;
  owner: string;
}

export class AgentMarketplaceV2 extends EventEmitter {
  private orchestrator: IntelligentOrchestrator;
  private listings: Map<string, AgentListing> = new Map();

  constructor(orchestrator: IntelligentOrchestrator) {
    super();
    this.orchestrator = orchestrator;
    this.seedMarketplace();
  }

  private seedMarketplace() {
    this.listings.set('personal-ai-pro', {
      id: 'personal-ai-pro',
      name: 'Personal AI Pro',
      capabilities: ['memory', 'planning', 'personal'],
      price: 29,
      rating: 4.8,
      owner: 'quant-ecosystem',
    });
    this.listings.set('swarm-leader', {
      id: 'swarm-leader',
      name: 'Swarm Leader Agent',
      capabilities: ['orchestration', 'consensus'],
      price: 49,
      rating: 4.9,
      owner: 'quant-ecosystem',
    });
  }

  async discoverAgents(query: string): Promise<AgentListing[]> {
    return Array.from(this.listings.values()).filter(
      (l) => l.capabilities.some((c) => c.includes(query)) || l.name.toLowerCase().includes(query),
    );
  }

  async purchaseAndIntegrate(listingId: string): Promise<any> {
    const listing = this.listings.get(listingId);
    if (!listing) throw new Error('Listing not found');

    // Simulate integration with orchestrator
    const result = await this.orchestrator.runIntelligentTask(
      `Integrate purchased agent: ${listing.name}`,
    );

    this.emit('marketplace:purchased', { listing, result });
    return { success: true, listing, integration: result };
  }
}
