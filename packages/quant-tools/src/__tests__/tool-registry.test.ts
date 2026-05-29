import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../registry/tool-registry.js';
import { allTools } from '../tools/index.js';
import type { ToolDefinition } from '../types.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  const sampleTool: ToolDefinition = {
    id: 'test.tool',
    appId: 'testapp',
    name: 'Test Tool',
    description: 'A test tool for unit testing',
    inputSchema: {
      message: { type: 'string', required: true, description: 'Message content' },
      count: { type: 'number', required: false, description: 'Repeat count', default: 1 },
    },
    outputSchema: {
      type: 'object',
      description: 'Test result',
      fields: { success: { type: 'boolean', description: 'Success flag' } },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['test', 'example'],
  };

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register a tool', () => {
    registry.register(sampleTool);
    expect(registry.get('test.tool')).toEqual(sampleTool);
  });

  it('should unregister a tool', () => {
    registry.register(sampleTool);
    const result = registry.unregister('test.tool');
    expect(result).toBe(true);
    expect(registry.get('test.tool')).toBeUndefined();
  });

  it('should return false when unregistering non-existent tool', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('should get tools by app', () => {
    registry.register(sampleTool);
    registry.register({ ...sampleTool, id: 'test.tool2', appId: 'testapp' });
    registry.register({ ...sampleTool, id: 'other.tool', appId: 'otherapp' });

    const appTools = registry.getByApp('testapp');
    expect(appTools).toHaveLength(2);
    expect(appTools.every((t) => t.appId === 'testapp')).toBe(true);
  });

  it('should search tools by name', () => {
    registry.register(sampleTool);
    const results = registry.search('Test');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe('test.tool');
  });

  it('should search tools by tag', () => {
    registry.register(sampleTool);
    const results = registry.search('example');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe('test.tool');
  });

  it('should search tools by description', () => {
    registry.register(sampleTool);
    const results = registry.search('unit testing');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should list all registered tools', () => {
    registry.register(sampleTool);
    registry.register({ ...sampleTool, id: 'test.tool2' });
    expect(registry.listAll()).toHaveLength(2);
  });

  it('should validate input - missing required param', () => {
    registry.register(sampleTool);
    const result = registry.validateInput('test.tool', {});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required parameter: message');
  });

  it('should validate input - wrong type', () => {
    registry.register(sampleTool);
    const result = registry.validateInput('test.tool', { message: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("expected type 'string'");
  });

  it('should validate input - success', () => {
    registry.register(sampleTool);
    const result = registry.validateInput('test.tool', { message: 'hello' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return error for non-existent tool validation', () => {
    const result = registry.validateInput('nonexistent', {});
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });

  it('should get permission tier', () => {
    registry.register(sampleTool);
    expect(registry.getPermissionTier('test.tool')).toBe(1);
  });

  it('should return undefined tier for non-existent tool', () => {
    expect(registry.getPermissionTier('nonexistent')).toBeUndefined();
  });

  it('should handle overwriting a tool with same id', () => {
    registry.register(sampleTool);
    const updated = { ...sampleTool, name: 'Updated Tool' };
    registry.register(updated);
    expect(registry.get('test.tool')!.name).toBe('Updated Tool');
    expect(registry.listAll()).toHaveLength(1);
  });

  it('should register all 85 predefined tools', () => {
    for (const tool of allTools) {
      registry.register(tool);
    }
    expect(registry.listAll()).toHaveLength(85);
  });
});
