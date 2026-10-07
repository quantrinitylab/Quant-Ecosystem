import type { PermissionTier, ToolDefinition, ToolInputSchema } from '../types.js';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  unregister(id: string): boolean {
    return this.tools.delete(id);
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  getByApp(appId: string): ToolDefinition[] {
    return [...this.tools.values()].filter((t) => t.appId === appId);
  }

  search(query: string): ToolDefinition[] {
    const lower = query.toLowerCase();
    return [...this.tools.values()].filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.description.toLowerCase().includes(lower) ||
        t.tags.some((tag) => tag.toLowerCase().includes(lower)),
    );
  }

  listAll(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  validateInput(
    toolId: string,
    args: Record<string, unknown>,
  ): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return { valid: false, errors: [`Tool '${toolId}' not found`] };
    }

    const errors: string[] = [];
    const schema: ToolInputSchema = tool.inputSchema;

    for (const [key, def] of Object.entries(schema)) {
      if (def.required && !(key in args)) {
        errors.push(`Missing required parameter: ${key}`);
        continue;
      }

      if (key in args) {
        const value = args[key];
        if (!this.checkType(value, def.type)) {
          errors.push(`Parameter '${key}' expected type '${def.type}' but got '${typeof value}'`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  getPermissionTier(toolId: string): PermissionTier | undefined {
    const tool = this.tools.get(toolId);
    return tool?.permissionTier;
  }

  private checkType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }
}
