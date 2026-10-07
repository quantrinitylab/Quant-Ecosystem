import type {
  MCPToolEntry,
  PermissionTier,
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from '../types.js';
import { ToolExecutor } from '../executor/tool-executor.js';

interface AuthResult {
  valid: boolean;
  userId: string;
  tier: PermissionTier;
}

export class MCPServerAdapter {
  private tools: ToolDefinition[];
  private executor: ToolExecutor;
  private tokens: Map<string, { userId: string; tier: PermissionTier }> = new Map();

  constructor(tools: ToolDefinition[], executor: ToolExecutor) {
    this.tools = tools;
    this.executor = executor;
  }

  registerToken(token: string, userId: string, tier: PermissionTier): void {
    this.tokens.set(token, { userId, tier });
  }

  getCatalog(): MCPToolEntry[] {
    return this.tools.map((tool) => ({
      name: tool.id,
      description: tool.description,
      inputSchema: tool.inputSchema,
      permissionTier: tool.permissionTier,
    }));
  }

  async handleRequest(
    toolName: string,
    args: Record<string, unknown>,
    token: string,
  ): Promise<ToolResult> {
    const auth = this.authenticate(token);
    if (!auth.valid) {
      return {
        success: false,
        data: null,
        error: 'Authentication failed',
        executionId: '',
        toolId: toolName,
        latencyMs: 0,
      };
    }

    const tool = this.tools.find((t) => t.id === toolName);
    if (!tool) {
      return {
        success: false,
        data: null,
        error: `Tool '${toolName}' not found`,
        executionId: '',
        toolId: toolName,
        latencyMs: 0,
      };
    }

    if (auth.tier < tool.permissionTier) {
      return {
        success: false,
        data: null,
        error: `Insufficient permissions: requires tier ${tool.permissionTier}`,
        executionId: '',
        toolId: toolName,
        latencyMs: 0,
      };
    }

    const context: ToolExecutionContext = {
      userId: auth.userId,
      sessionId: `mcp-${Date.now()}`,
      permissions: auth.tier,
      dryRun: false,
    };

    return this.executor.executeSingle(toolName, args, context);
  }

  authenticate(token: string): AuthResult {
    const entry = this.tokens.get(token);
    if (!entry) {
      return { valid: false, userId: '', tier: 0 as PermissionTier };
    }
    return { valid: true, userId: entry.userId, tier: entry.tier };
  }
}
