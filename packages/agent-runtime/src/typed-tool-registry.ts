import { z } from 'zod';
import type { ToolDefinition, AgentActionTier } from './types.js';

const ToolParameterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string(),
  required: z.boolean(),
  default: z.unknown().optional(),
});

const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: z.array(ToolParameterSchema),
  requiredTier: z.number().int().min(0).max(4),
  category: z.string().min(1),
  handler: z.function(),
});

export class TypedToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  registerTool(tool: ToolDefinition): void {
    ToolDefinitionSchema.parse(tool);
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getToolsByTier(tier: AgentActionTier): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => t.requiredTier <= tier);
  }

  getToolsByCategory(category: string): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => t.category === category);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  validateArgs(
    toolName: string,
    args: Record<string, unknown>,
  ): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { valid: false, errors: [`Tool '${toolName}' not found`] };
    }

    const errors: string[] = [];

    for (const param of tool.parameters) {
      const value = args[param.name];

      if (param.required && value === undefined) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }

      if (value !== undefined) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== param.type && !(param.type === 'object' && actualType === 'object')) {
          errors.push(
            `Parameter '${param.name}' expected type '${param.type}' but got '${actualType}'`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
