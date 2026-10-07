import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolService } from '../services/tool.service';

describe('ToolService', () => {
  let service: ToolService;

  beforeEach(() => {
    service = new ToolService();
  });

  describe('built-in tools', () => {
    it('has calculator, current_time, and echo registered', () => {
      const tools = service.listTools('user-1');
      const names = tools.map((t) => t.name);

      expect(names).toContain('calculator');
      expect(names).toContain('current_time');
      expect(names).toContain('echo');
    });
  });

  describe('registerTool', () => {
    it('adds a tool to the registry', () => {
      const customTool = {
        name: 'custom_tool',
        description: 'A custom tool',
        parameters: { type: 'object', properties: {} },
        handler: vi.fn().mockResolvedValue('result'),
      };

      service.registerTool(customTool);

      const tools = service.listTools('user-1');
      const names = tools.map((t) => t.name);
      expect(names).toContain('custom_tool');
    });
  });

  describe('executeTool', () => {
    it('executes calculator tool with valid expression', async () => {
      const result = await service.executeTool('calculator', { expression: '2 + 3' }, 'user-1');
      expect(result).toBe('5');
    });

    it('executes calculator tool with complex expression', async () => {
      const result = await service.executeTool(
        'calculator',
        { expression: '(10 * 5) / 2' },
        'user-1',
      );
      expect(result).toBe('25');
    });

    it('rejects invalid calculator expressions', async () => {
      await expect(
        service.executeTool('calculator', { expression: 'process.exit()' }, 'user-1'),
      ).rejects.toThrow('Invalid math expression');
    });

    it('executes echo tool', async () => {
      const result = await service.executeTool('echo', { text: 'Hello world' }, 'user-1');
      expect(result).toBe('Hello world');
    });

    it('executes current_time tool', async () => {
      const result = await service.executeTool('current_time', {}, 'user-1');
      expect(result).toBeTruthy();
      // Should be a valid date string
      expect(new Date(result).toString()).not.toBe('Invalid Date');
    });

    it('throws TOOL_NOT_FOUND for unknown tool', async () => {
      await expect(service.executeTool('nonexistent', {}, 'user-1')).rejects.toThrow(
        "Tool 'nonexistent' not found",
      );
    });

    it('calls handler with provided args', async () => {
      const handler = vi.fn().mockResolvedValue('custom result');
      service.registerTool({
        name: 'test_tool',
        description: 'Test',
        parameters: { type: 'object' },
        handler,
      });

      const result = await service.executeTool('test_tool', { key: 'value' }, 'user-1');

      expect(handler).toHaveBeenCalledWith({ key: 'value' });
      expect(result).toBe('custom result');
    });
  });

  describe('listTools', () => {
    it('returns tools without handler functions', () => {
      const tools = service.listTools('user-1');

      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
        expect(tool).not.toHaveProperty('handler');
      }
    });

    it('returns all registered tools', () => {
      service.registerTool({
        name: 'extra',
        description: 'Extra tool',
        parameters: {},
        handler: async () => 'ok',
      });

      const tools = service.listTools('user-1');
      expect(tools.length).toBeGreaterThanOrEqual(4); // 3 built-in + 1 extra
    });
  });
});
