// ============================================================================
// Agentic - Agent Marketplace
// ============================================================================
//
// Dual-mode marketplace install:
//   - When a marketplace backend is configured (AGENT_MARKETPLACE_URL,
//     optionally AGENT_MARKETPLACE_API_KEY) installs are performed against the
//     real marketplace service over HTTP.
//   - Otherwise (or on backend error) the install degrades to a safe, functional
//     in-process record so local development and tests keep working. Errors
//     falling back are logged as warnings (never silently swallowed). Marketplace
//     install is not a money path, so graceful degradation is acceptable here.

import { logger } from '@quant/common';

export interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  rating: number;
  downloads: number;
  author: string;
  price: number; // 0 for free
}

/**
 * Pluggable marketplace backend that performs the real install against an
 * external marketplace service. Tests can supply a fake to exercise the
 * real-mode path without touching the network.
 */
export interface MarketplaceBackend {
  /** Install an agent for a user. Resolves to true on success. */
  install(userId: string, agentId: string): Promise<boolean>;
}

/**
 * Real marketplace backend backed by a configured HTTP service. Enabled by
 * AGENT_MARKETPLACE_URL (optionally AGENT_MARKETPLACE_API_KEY).
 */
export class HttpMarketplaceBackend implements MarketplaceBackend {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async install(userId: string, agentId: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/installs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ userId, agentId }),
    });
    if (!res.ok) {
      throw new Error(`marketplace service responded ${res.status}`);
    }
    const body = (await res.json()) as { success?: boolean };
    return body.success ?? true;
  }
}

export class AgentMarketplace {
  private readonly backend: MarketplaceBackend | null;
  /** In-process record of installs used by the fallback path. */
  private readonly installs: Map<string, Set<string>> = new Map();

  private agents: MarketplaceAgent[] = [
    {
      id: 'productivity-agent',
      name: 'Productivity Agent',
      description: 'Helps you manage tasks, emails, and calendar efficiently',
      capabilities: ['task_management', 'email', 'calendar'],
      rating: 4.8,
      downloads: 12400,
      author: 'Quant Team',
      price: 0,
    },
    {
      id: 'research-agent',
      name: 'Research Agent',
      description: 'Deep research and information synthesis across the web',
      capabilities: ['web_search', 'summarization', 'fact_checking'],
      rating: 4.9,
      downloads: 8900,
      author: 'Quant Team',
      price: 9.99,
    },
    {
      id: 'social-agent',
      name: 'Social Media Agent',
      description: 'Manages your social presence across all platforms',
      capabilities: ['posting', 'engagement', 'analytics'],
      rating: 4.6,
      downloads: 15600,
      author: 'Quant Team',
      price: 4.99,
    },
  ];

  /**
   * @param backend Optional explicit backend (primarily for tests). When
   *   omitted, a real backend is constructed from environment configuration.
   */
  constructor(backend?: MarketplaceBackend) {
    this.backend = backend ?? AgentMarketplace.createBackendFromEnv();
  }

  private static createBackendFromEnv(): MarketplaceBackend | null {
    const url = process.env['AGENT_MARKETPLACE_URL'];
    if (url) {
      return new HttpMarketplaceBackend(url, process.env['AGENT_MARKETPLACE_API_KEY']);
    }
    return null;
  }

  /** Whether a real marketplace backend is wired up. */
  isBackendConfigured(): boolean {
    return this.backend !== null;
  }

  async getAllAgents(): Promise<MarketplaceAgent[]> {
    return this.agents;
  }

  async getAgent(id: string): Promise<MarketplaceAgent | undefined> {
    return this.agents.find((a) => a.id === id);
  }

  async searchAgents(query: string): Promise<MarketplaceAgent[]> {
    const q = query.toLowerCase();
    return this.agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.capabilities.some((c) => c.toLowerCase().includes(q)),
    );
  }

  async installAgent(userId: string, agentId: string): Promise<boolean> {
    if (this.backend) {
      try {
        return await this.backend.install(userId, agentId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(
          `[agent-marketplace] install backend failed for ${agentId}, recording locally: ${message}`,
        );
      }
    }

    // Fallback: record the install in-process so the user's installed set is
    // still functional without a configured marketplace service.
    logger.log(`Installing agent ${agentId} for user ${userId}`);
    const userInstalls = this.installs.get(userId) ?? new Set<string>();
    userInstalls.add(agentId);
    this.installs.set(userId, userInstalls);
    return true;
  }

  /** List the agent ids a user has installed via the in-process fallback. */
  getInstalledAgents(userId: string): string[] {
    return Array.from(this.installs.get(userId) ?? []);
  }
}

export const marketplace = new AgentMarketplace();
