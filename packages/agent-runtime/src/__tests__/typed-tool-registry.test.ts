import { describe, it, expect } from 'vitest';
import { TypedToolRegistry } from '../typed-tool-registry.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

function createMockTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'testTool',
    description: 'A test tool',
    parameters: [{ name: 'input', type: 'string', description: 'Input value', required: true }],
    requiredTier: AgentActionTier.Tier0_ReadOnly,
    category: 'testing',
    handler: async (): Promise<ToolExecutionResult> => ({ success: true, undoable: false }),
    ...overrides,
  };
}

describe('TypedToolRegistry', () => {
  describe('registerTool', () => {
    it('registers a valid tool', () => {
      const registry = new TypedToolRegistry();
      const tool = createMockTool();
      registry.registerTool(tool);
      expect(registry.hasTool('testTool')).toBe(true);
    });

    it('throws on invalid tool definition', () => {
      const registry = new TypedToolRegistry();
      expect(() =>
        registry.registerTool({
          name: '',
          description: 'invalid',
          parameters: [],
          requiredTier: AgentActionTier.Tier0_ReadOnly,
          category: 'test',
          handler: async () => ({ success: true, undoable: false }),
        }),
      ).toThrow();
    });
  });

  describe('getTool', () => {
    it('returns a registered tool', () => {
      const registry = new TypedToolRegistry();
      const tool = createMockTool({ name: 'myTool' });
      registry.registerTool(tool);
      expect(registry.getTool('myTool')).toBeDefined();
      expect(registry.getTool('myTool')?.name).toBe('myTool');
    });

    it('returns undefined for unregistered tool', () => {
      const registry = new TypedToolRegistry();
      expect(registry.getTool('nonexistent')).toBeUndefined();
    });
  });

  describe('getToolsByTier', () => {
    it('returns tools at or below the specified tier', () => {
      const registry = new TypedToolRegistry();
      registry.registerTool(
        createMockTool({ name: 'tier0', requiredTier: AgentActionTier.Tier0_ReadOnly }),
      );
      registry.registerTool(
        createMockTool({ name: 'tier1', requiredTier: AgentActionTier.Tier1_DraftOnly }),
      );
      registry.registerTool(
        createMockTool({ name: 'tier2', requiredTier: AgentActionTier.Tier2_LowRisk }),
      );
      registry.registerTool(
        createMockTool({ name: 'tier3', requiredTier: AgentActionTier.Tier3_HighRisk }),
      );

      const tier1Tools = registry.getToolsByTier(AgentActionTier.Tier1_DraftOnly);
      expect(tier1Tools).toHaveLength(2);
      expect(tier1Tools.map((t) => t.name).sort()).toEqual(['tier0', 'tier1']);
    });
  });

  describe('getToolsByCategory', () => {
    it('returns tools matching the category', () => {
      const registry = new TypedToolRegistry();
      registry.registerTool(createMockTool({ name: 'emailRead', category: 'email' }));
      registry.registerTool(createMockTool({ name: 'emailSend', category: 'email' }));
      registry.registerTool(createMockTool({ name: 'calendarRead', category: 'calendar' }));

      const emailTools = registry.getToolsByCategory('email');
      expect(emailTools).toHaveLength(2);
      expect(emailTools.every((t) => t.category === 'email')).toBe(true);
    });
  });

  describe('getAllTools', () => {
    it('returns all registered tools', () => {
      const registry = new TypedToolRegistry();
      registry.registerTool(createMockTool({ name: 'tool1' }));
      registry.registerTool(createMockTool({ name: 'tool2' }));
      registry.registerTool(createMockTool({ name: 'tool3' }));

      expect(registry.getAllTools()).toHaveLength(3);
    });
  });

  describe('hasTool', () => {
    it('returns true for registered tools', () => {
      const registry = new TypedToolRegistry();
      registry.registerTool(createMockTool({ name: 'exists' }));
      expect(registry.hasTool('exists')).toBe(true);
    });

    it('returns false for unregistered tools', () => {
      const registry = new TypedToolRegistry();
      expect(registry.hasTool('nope')).toBe(false);
    });
  });

  describe('validateArgs', () => {
    it('passes for valid args', () => {
      const registry = new TypedToolRegistry();
      registry.registerTool(createMockTool({ name: 'tool1' }));
      const result = registry.validateArgs('tool1', { input: 'hello' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails for missing required args', () => {
      const registry = new TypedToolRegistry();
      registry.registerTool(createMockTool({ name: 'tool1' }));
      const result = registry.validateArgs('tool1', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required parameter: input');
    });

    it('fails for type mismatches', () => {
      const registry = new TypedToolRegistry();
      registry.registerTool(createMockTool({ name: 'tool1' }));
      const result = registry.validateArgs('tool1', { input: 123 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("expected type 'string'");
    });

    it('fails for unknown tool', () => {
      const registry = new TypedToolRegistry();
      const result = registry.validateArgs('unknown', { input: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Tool 'unknown' not found");
    });
  });
});
