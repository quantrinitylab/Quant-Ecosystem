import { describe, it, expect, beforeEach } from 'vitest';
import { AgentMarketplace } from '../services/agent-marketplace.service';

describe('AgentMarketplace', () => {
  let marketplace: AgentMarketplace;

  beforeEach(() => {
    marketplace = new AgentMarketplace();
  });

  describe('listAgents', () => {
    it('returns default agents in catalog', () => {
      const result = marketplace.listAgents();

      expect(result.data.length).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeGreaterThanOrEqual(2);
    });

    it('returns paginated results', () => {
      const result = marketplace.listAgents({ page: 1, pageSize: 1 });

      expect(result.data.length).toBe(1);
      expect(result.hasNext).toBe(true);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(1);
    });
  });

  describe('getAgent', () => {
    it('returns a specific agent by id', () => {
      const agent = marketplace.getAgent('agent-code-assistant');

      expect(agent.name).toBe('Code Assistant');
      expect(agent.capabilities).toContain('code_generation');
    });

    it('throws AGENT_NOT_FOUND for unknown agent', () => {
      expect(() => marketplace.getAgent('nonexistent')).toThrow('Agent not found');
    });
  });

  describe('installAgent', () => {
    it('installs an agent for a user', () => {
      const agent = marketplace.installAgent('user-1', 'agent-code-assistant');

      expect(agent.id).toBe('agent-code-assistant');
      expect(agent.name).toBe('Code Assistant');
    });

    it('persists installation in user agents', () => {
      marketplace.installAgent('user-1', 'agent-code-assistant');

      const userAgents = marketplace.getUserAgents('user-1');
      expect(userAgents).toHaveLength(1);
      expect(userAgents[0]!.id).toBe('agent-code-assistant');
    });

    it('throws AGENT_NOT_FOUND for unknown agent', () => {
      expect(() => marketplace.installAgent('user-1', 'nonexistent')).toThrow('Agent not found');
    });

    it('allows installing multiple agents', () => {
      marketplace.installAgent('user-1', 'agent-code-assistant');
      marketplace.installAgent('user-1', 'agent-writer');

      const userAgents = marketplace.getUserAgents('user-1');
      expect(userAgents).toHaveLength(2);
    });
  });

  describe('uninstallAgent', () => {
    it('removes an installed agent', () => {
      marketplace.installAgent('user-1', 'agent-code-assistant');
      marketplace.uninstallAgent('user-1', 'agent-code-assistant');

      const userAgents = marketplace.getUserAgents('user-1');
      expect(userAgents).toHaveLength(0);
    });

    it('throws AGENT_NOT_INSTALLED for non-installed agent', () => {
      expect(() => marketplace.uninstallAgent('user-1', 'agent-code-assistant')).toThrow(
        'Agent not installed',
      );
    });
  });

  describe('createAgent', () => {
    it('creates a custom agent with valid manifest', () => {
      const agent = marketplace.createAgent('user-1', {
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

    it('makes created agent available in catalog', () => {
      const agent = marketplace.createAgent('user-1', {
        name: 'Catalog Agent',
        description: 'Should appear in catalog',
        version: '1.0.0',
        author: 'user-1',
        capabilities: [],
        systemPrompt: 'You are a catalog agent.',
        tools: [],
      });

      const fetched = marketplace.getAgent(agent.id);
      expect(fetched.name).toBe('Catalog Agent');
    });

    it('throws INVALID_MANIFEST when name is missing', () => {
      expect(() =>
        marketplace.createAgent('user-1', {
          name: '',
          description: 'No name',
          version: '1.0.0',
          author: 'user-1',
          capabilities: [],
          systemPrompt: 'prompt',
          tools: [],
        }),
      ).toThrow('Invalid manifest');
    });

    it('throws INVALID_MANIFEST when systemPrompt is missing', () => {
      expect(() =>
        marketplace.createAgent('user-1', {
          name: 'Agent',
          description: 'No prompt',
          version: '1.0.0',
          author: 'user-1',
          capabilities: [],
          systemPrompt: '',
          tools: [],
        }),
      ).toThrow('Invalid manifest');
    });
  });

  describe('getUserAgents', () => {
    it('returns empty array for user with no installations', () => {
      const agents = marketplace.getUserAgents('user-new');
      expect(agents).toEqual([]);
    });
  });
});
