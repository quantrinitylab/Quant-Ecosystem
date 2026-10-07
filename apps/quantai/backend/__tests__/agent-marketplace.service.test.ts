import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentMarketplace,
  OFFICIAL_AGENTS,
  type MarketplacePrismaClient,
} from '../services/agent-marketplace.service';

// A lightweight in-memory fake of the Prisma slice the service uses. It mirrors
// the persistence semantics (durable across calls, unique [userId, agentId])
// so the tests exercise the real service logic against realistic behavior.
function createFakePrisma(): MarketplacePrismaClient {
  const agents: Array<Record<string, unknown>> = [];
  const installs: Array<{ id: string; userId: string; agentId: string }> = [];
  let seq = 0;

  return {
    aiMarketplaceAgent: {
      findUnique: async ({ where }) => (agents.find((a) => a['id'] === where.id) as never) ?? null,
      findMany: async () => agents as never,
      create: async ({ data }) => {
        const row = { id: `custom-${++seq}`, createdAt: new Date(), ...data };
        agents.push(row);
        return row as never;
      },
    },
    aiAgentInstall: {
      findUnique: async ({ where }) => {
        const key = (where as { userId_agentId: { userId: string; agentId: string } })
          .userId_agentId;
        const found = installs.find((i) => i.userId === key.userId && i.agentId === key.agentId);
        return found ? { id: found.id } : null;
      },
      findMany: async ({ where }) =>
        installs.filter((i) => i.userId === (where as { userId: string }).userId),
      create: async ({ data }) => {
        const d = data as { userId: string; agentId: string };
        const row = { id: `install-${++seq}`, userId: d.userId, agentId: d.agentId };
        installs.push(row);
        return row;
      },
      deleteMany: async ({ where }) => {
        const w = where as { userId: string; agentId: string };
        const before = installs.length;
        for (let i = installs.length - 1; i >= 0; i -= 1) {
          if (installs[i]!.userId === w.userId && installs[i]!.agentId === w.agentId) {
            installs.splice(i, 1);
          }
        }
        return { count: before - installs.length };
      },
    },
  };
}

describe('AgentMarketplace (Prisma-backed)', () => {
  let marketplace: AgentMarketplace;

  beforeEach(() => {
    marketplace = new AgentMarketplace(createFakePrisma());
  });

  describe('listAgents', () => {
    it('returns the official agents in the catalog', async () => {
      const result = await marketplace.listAgents();

      expect(result.data.length).toBeGreaterThanOrEqual(OFFICIAL_AGENTS.length);
      expect(result.total).toBeGreaterThanOrEqual(OFFICIAL_AGENTS.length);
    });

    it('returns paginated results', async () => {
      const result = await marketplace.listAgents({ page: 1, pageSize: 1 });

      expect(result.data.length).toBe(1);
      expect(result.hasNext).toBe(true);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(1);
    });
  });

  describe('getAgent', () => {
    it('returns a specific official agent by id', async () => {
      const agent = await marketplace.getAgent('agent-code-assistant');

      expect(agent.name).toBe('Code Assistant');
      expect(agent.capabilities).toContain('code_generation');
    });

    it('throws AGENT_NOT_FOUND for unknown agent', async () => {
      await expect(marketplace.getAgent('nonexistent')).rejects.toThrow('Agent not found');
    });
  });

  describe('installAgent', () => {
    it('installs an agent for a user', async () => {
      const agent = await marketplace.installAgent('user-1', 'agent-code-assistant');

      expect(agent.id).toBe('agent-code-assistant');
      expect(agent.name).toBe('Code Assistant');
    });

    it('persists the installation durably', async () => {
      await marketplace.installAgent('user-1', 'agent-code-assistant');

      const userAgents = await marketplace.getUserAgents('user-1');
      expect(userAgents).toHaveLength(1);
      expect(userAgents[0]!.id).toBe('agent-code-assistant');
    });

    it('is idempotent when installing the same agent twice', async () => {
      await marketplace.installAgent('user-1', 'agent-code-assistant');
      await marketplace.installAgent('user-1', 'agent-code-assistant');

      const userAgents = await marketplace.getUserAgents('user-1');
      expect(userAgents).toHaveLength(1);
    });

    it('throws AGENT_NOT_FOUND for unknown agent', async () => {
      await expect(marketplace.installAgent('user-1', 'nonexistent')).rejects.toThrow(
        'Agent not found',
      );
    });

    it('allows installing multiple agents', async () => {
      await marketplace.installAgent('user-1', 'agent-code-assistant');
      await marketplace.installAgent('user-1', 'agent-writer');

      const userAgents = await marketplace.getUserAgents('user-1');
      expect(userAgents).toHaveLength(2);
    });
  });

  describe('uninstallAgent', () => {
    it('removes an installed agent', async () => {
      await marketplace.installAgent('user-1', 'agent-code-assistant');
      await marketplace.uninstallAgent('user-1', 'agent-code-assistant');

      const userAgents = await marketplace.getUserAgents('user-1');
      expect(userAgents).toHaveLength(0);
    });

    it('throws AGENT_NOT_INSTALLED for non-installed agent', async () => {
      await expect(marketplace.uninstallAgent('user-1', 'agent-code-assistant')).rejects.toThrow(
        'Agent not installed',
      );
    });
  });

  describe('createAgent', () => {
    it('creates and persists a custom agent', async () => {
      const agent = await marketplace.createAgent('user-1', {
        name: 'My Custom Agent',
        description: 'A custom agent for testing',
        version: '1.0.0',
        author: 'user-1',
        capabilities: ['custom_cap'],
        systemPrompt: 'You are a custom agent.',
        tools: ['echo'],
      });

      expect(agent.id).toBeTruthy();
      expect(agent.name).toBe('My Custom Agent');
      expect(agent.author).toBe('user-1');
    });

    it('makes created agent available in the catalog', async () => {
      const agent = await marketplace.createAgent('user-1', {
        name: 'Catalog Agent',
        description: 'Should appear in catalog',
        version: '1.0.0',
        author: 'user-1',
        capabilities: [],
        systemPrompt: 'You are a catalog agent.',
        tools: [],
      });

      const fetched = await marketplace.getAgent(agent.id);
      expect(fetched.name).toBe('Catalog Agent');
    });

    it('throws INVALID_MANIFEST when name is missing', async () => {
      await expect(
        marketplace.createAgent('user-1', {
          name: '',
          description: 'No name',
          version: '1.0.0',
          author: 'user-1',
          capabilities: [],
          systemPrompt: 'prompt',
          tools: [],
        }),
      ).rejects.toThrow('Invalid manifest');
    });

    it('throws INVALID_MANIFEST when systemPrompt is missing', async () => {
      await expect(
        marketplace.createAgent('user-1', {
          name: 'Agent',
          description: 'No prompt',
          version: '1.0.0',
          author: 'user-1',
          capabilities: [],
          systemPrompt: '',
          tools: [],
        }),
      ).rejects.toThrow('Invalid manifest');
    });
  });

  describe('getUserAgents', () => {
    it('returns empty array for user with no installations', async () => {
      const agents = await marketplace.getUserAgents('user-new');
      expect(agents).toEqual([]);
    });

    it('includes installed custom agents', async () => {
      const created = await marketplace.createAgent('user-1', {
        name: 'Installed Custom',
        description: 'desc',
        version: '1.0.0',
        author: 'user-1',
        capabilities: [],
        systemPrompt: 'prompt',
        tools: [],
      });
      await marketplace.installAgent('user-1', created.id);

      const agents = await marketplace.getUserAgents('user-1');
      expect(agents.map((a) => a.id)).toContain(created.id);
    });
  });
});
