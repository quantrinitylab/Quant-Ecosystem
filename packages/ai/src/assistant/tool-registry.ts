// ============================================================================
// Universal AI Assistant - Tool Registry
// ============================================================================

import type { QuantApp } from '@quant/common';
import type { AITool } from './types';

/**
 * ToolRegistry manages all registered tools across Quant apps.
 * It provides lookup, registration, and prompt generation capabilities.
 */
export class ToolRegistry {
  private tools: Map<QuantApp, AITool[]> = new Map();

  /**
   * Register tools for a specific app
   */
  registerApp(app: QuantApp, tools: AITool[]): void {
    const existing = this.tools.get(app) || [];
    this.tools.set(app, [...existing, ...tools]);
  }

  /**
   * Get all tools registered for a specific app
   */
  getToolsForApp(app: QuantApp): AITool[] {
    return this.tools.get(app) || [];
  }

  /**
   * Get all registered tools across all apps
   */
  getAllTools(): AITool[] {
    const all: AITool[] = [];
    for (const tools of this.tools.values()) {
      all.push(...tools);
    }
    return all;
  }

  /**
   * Find a specific tool by app and name
   */
  findTool(app: QuantApp, toolName: string): AITool | undefined {
    const appTools = this.tools.get(app);
    if (!appTools) return undefined;
    return appTools.find((t) => t.name === toolName);
  }

  /**
   * Generate formatted tool descriptions for use in LLM system prompts
   */
  getToolDescriptionsForPrompt(): string {
    const lines: string[] = ['Available tools:'];

    for (const [app, tools] of this.tools.entries()) {
      lines.push(`\n[${app}]`);
      for (const tool of tools) {
        const params = Object.entries(tool.parameters)
          .map(([name, param]) => `${name}${param.required ? '*' : ''}: ${param.type}`)
          .join(', ');
        lines.push(`  - ${tool.name}(${params}): ${tool.description}`);
      }
    }

    return lines.join('\n');
  }
}
