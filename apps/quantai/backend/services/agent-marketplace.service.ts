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

/**
 * First-party "official" agents shipped with QuantAI. Defining a curated set of
 * built-in agents in code is intentional (like an editor shipping built-in
 * extensions) — it is real catalog data, not a mock. User-created agents and all
 * installations are persisted in Postgres via Prisma below.
 */
export const OFFICIAL_AGENTS: readonly AgentManifest[] = [
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

interface MarketplaceAgentRow {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  capabilities: unknown;
  systemPrompt: string;
  tools: unknown;
  modelPreference: string | null;
  icon: string | null;
}

/**
 * Structural slice of the Prisma client this service depends on. Declaring it
 * structurally keeps the service unit-testable with a lightweight fake while the
 * real `@quant/database` client satisfies the same shape at runtime.
 */
export interface MarketplacePrismaClient {
  aiMarketplaceAgent: {
    findUnique: (args: { where: { id: string } }) => Promise<MarketplaceAgentRow | null>;
    findMany: (args?: Record<string, unknown>) => Promise<MarketplaceAgentRow[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<MarketplaceAgentRow>;
  };
  aiAgentInstall: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{ id: string } | null>;
    findMany: (args: { where: Record<string, unknown> }) => Promise<Array<{ agentId: string }>>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
  };
}

export class AgentMarketplace {
  constructor(private readonly prisma: MarketplacePrismaClient) {}

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  }

  private rowToManifest(row: MarketplaceAgentRow): AgentManifest {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      author: row.author,
      capabilities: this.toStringArray(row.capabilities),
      systemPrompt: row.systemPrompt,
      tools: this.toStringArray(row.tools),
      modelPreference: row.modelPreference ?? undefined,
      icon: row.icon ?? undefined,
    };
  }

  private async getAllAgents(): Promise<AgentManifest[]> {
    const customRows = await this.prisma.aiMarketplaceAgent.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return [...OFFICIAL_AGENTS, ...customRows.map((row) => this.rowToManifest(row))];
  }

  async listAgents(options: PaginationOptions = {}): Promise<PaginatedResult<AgentManifest>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;

    const allAgents = await this.getAllAgents();
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

  async getAgent(agentId: string): Promise<AgentManifest> {
    const official = OFFICIAL_AGENTS.find((a) => a.id === agentId);
    if (official) {
      return official;
    }

    const row = await this.prisma.aiMarketplaceAgent.findUnique({ where: { id: agentId } });
    if (!row) {
      throw createAppError('Agent not found', 404, 'AGENT_NOT_FOUND');
    }
    return this.rowToManifest(row);
  }

  /** Install an agent for a user. Idempotent: re-installing is a no-op. */
  async installAgent(userId: string, agentId: string): Promise<AgentManifest> {
    // Validates existence (throws AGENT_NOT_FOUND for unknown agents).
    const agent = await this.getAgent(agentId);

    const existing = await this.prisma.aiAgentInstall.findUnique({
      where: { userId_agentId: { userId, agentId } },
    });
    if (!existing) {
      await this.prisma.aiAgentInstall.create({ data: { userId, agentId } });
    }

    return agent;
  }

  async uninstallAgent(userId: string, agentId: string): Promise<void> {
    const result = await this.prisma.aiAgentInstall.deleteMany({ where: { userId, agentId } });
    if (result.count === 0) {
      throw createAppError('Agent not installed', 404, 'AGENT_NOT_INSTALLED');
    }
  }

  async createAgent(userId: string, manifest: Omit<AgentManifest, 'id'>): Promise<AgentManifest> {
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

    const row = await this.prisma.aiMarketplaceAgent.create({
      data: {
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        author: userId,
        capabilities: manifest.capabilities ?? [],
        systemPrompt: manifest.systemPrompt,
        tools: manifest.tools ?? [],
        modelPreference: manifest.modelPreference ?? null,
        icon: manifest.icon ?? null,
      },
    });

    return this.rowToManifest(row);
  }

  async getUserAgents(userId: string): Promise<AgentManifest[]> {
    const installs = await this.prisma.aiAgentInstall.findMany({ where: { userId } });
    const installedIds = new Set(installs.map((i) => i.agentId));
    if (installedIds.size === 0) {
      return [];
    }

    const all = await this.getAllAgents();
    return all.filter((agent) => installedIds.has(agent.id));
  }
}
