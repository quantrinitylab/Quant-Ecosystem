// ============================================================================
// Universal AI Assistant - Action Executor
// ============================================================================

import type { QuantApp } from '@quant/common';
import type { ToolRegistry } from './tool-registry';
import type { AIToolResult, AssistantContext } from './types';

/**
 * ActionExecutor validates and executes tool actions.
 */
export class ActionExecutor {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * Execute a tool action with validation and error handling
   */
  async execute(
    app: QuantApp,
    toolName: string,
    args: Record<string, unknown>,
    context: AssistantContext,
  ): Promise<AIToolResult> {
    const tool = this.registry.findTool(app, toolName);

    if (!tool) {
      return {
        success: false,
        error: `Tool "${toolName}" not found for app "${app}"`,
        displayMessage: `I could not find the requested action "${toolName}" for ${app}.`,
      };
    }

    // Validate required parameters
    for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
      if (paramDef.required && !(paramName in args)) {
        return {
          success: false,
          error: `Missing required parameter: ${paramName}`,
          displayMessage: `I need more information. Please provide: ${paramDef.description}`,
        };
      }
    }

    try {
      const result = await tool.handler(args, context);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        error: errorMessage,
        displayMessage: `Something went wrong while executing ${toolName}: ${errorMessage}`,
      };
    }
  }
}
