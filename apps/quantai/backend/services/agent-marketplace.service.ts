import { createAppError } from '@quant/server-core';

export interface AgentManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  capabilities: string[];
  systemPrompt: string;
  tools: string[];
  modelPreference?: string;
  icon?: string;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class AgentMarketplace {
  private catalog: Map<string, AgentManifest> = new Map();
  private userInstallations: Map<string, Set<string>> = new Map();

  constructor() {
    this.seedDefaultAgents();
  }

  private seedDefaultAgents(): void {
    const defaults: AgentManifest[] = [
      {
        id: 'agent-code-assistant',
        name: 'Code Assistant',
        description: 'Helps write, review, and debug code',
        version: '1.0.0',
        author: 'QuantAI',
        capabilities: ['code_generation', 'code_review', 'debugging'],
        systemPrompt: 'You are a helpful coding assistant.',
        tools: ['code_interpreter'],
        modelPreference: 'gpt-4o',
      },
      {
        id: 'agent-writer',
        name: 'Writing Assistant',
        description: 'Helps with creative and professional writing',
        version: '1.0.0',
        author: 'QuantAI',
        capabilities: ['text_generation', 'summarization', 'editing'],
        systemPrompt: 'You are a professional writing assistant.',
        tools: [],
      },
    ];

    for (const agent of defaults) {
      this.catalog.set(agent.id, agent);
    }
  }

  installAgent(userId: string, agentId: string): AgentManifest {
    const agent = this.catalog.get(agentId);
    if (!agent) {
      throw createAppError('Agent not found', 404, 'AGENT_NOT_FOUND');
    }

    const installations = this.userInstallations.get(userId) ?? new Set();
    installations.add(agentId);
    this.userInstallations.set(userId, installations);

    return agent;
  }

  uninstallAgent(userId: string, agentId: string): void {
    const installations = this.userInstallations.get(userId);
    if (!installations || !installations.has(agentId)) {
      throw createAppError('Agent not installed', 404, 'AGENT_NOT_INSTALLED');
    }

    installations.delete(agentId);
  }

  listAgents(options: PaginationOptions = {}): PaginatedResult<AgentManifest> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const allAgents = Array.from(this.catalog.values());
    const total = allAgents.length;
    const skip = (page - 1) * pageSize;
    const data = allAgents.slice(skip, skip + pageSize);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  getAgent(agentId: string): AgentManifest {
    const agent = this.catalog.get(agentId);
    if (!agent) {
      throw createAppError('Agent not found', 404, 'AGENT_NOT_FOUND');
    }
    return agent;
  }

  createAgent(userId: string, manifest: Omit<AgentManifest, 'id'>): AgentManifest {
    if (!manifest.name || !manifest.description || !manifest.version) {
      throw createAppError(
        'Invalid manifest: name, description, and version are required',
        400,
        'INVALID_MANIFEST',
      );
    }

    if (!manifest.systemPrompt) {
      throw createAppError('Invalid manifest: systemPrompt is required', 400, 'INVALID_MANIFEST');
    }

    const id = `agent-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    const agent: AgentManifest = {
      ...manifest,
      id,
      author: userId,
    };

    this.catalog.set(id, agent);
    return agent;
  }

  getUserAgents(userId: string): AgentManifest[] {
    const installations = this.userInstallations.get(userId) ?? new Set();
    const agents: AgentManifest[] = [];

    for (const agentId of installations) {
      const agent = this.catalog.get(agentId);
      if (agent) {
        agents.push(agent);
      }
    }

    return agents;
  }
}
