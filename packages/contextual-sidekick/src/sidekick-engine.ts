// ============================================================================
// Contextual Sidekick - SidekickEngine
// ============================================================================

import type {
  SidekickTool,
  SidekickContext,
  SidekickPanel,
  SidekickActionResult,
  AppContextMapping,
} from './types';
import { ContextDetector } from './context-detector';

export class SidekickEngine {
  private tools: Map<string, SidekickTool> = new Map();
  private appMappings: Map<string, AppContextMapping> = new Map();
  private contextDetector: ContextDetector;

  constructor() {
    this.contextDetector = new ContextDetector();
  }

  registerTool(tool: SidekickTool): void {
    this.tools.set(tool.id, tool);
  }

  registerAppMapping(mapping: AppContextMapping): void {
    this.appMappings.set(mapping.app, mapping);
  }

  getPanel(context: SidekickContext): SidekickPanel {
    const filteredTools = this.getFilteredTools(context);
    const sortedTools = filteredTools.sort((a, b) => b.priority - a.priority);
    const contextSummary = this.buildContextSummary(context);
    const suggestions = this.contextDetector.generateSuggestions(context, sortedTools);

    return {
      tools: sortedTools,
      contextSummary,
      suggestions,
    };
  }

  async executeTool(toolId: string, context: SidekickContext): Promise<SidekickActionResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        success: false,
        message: `Tool not found: ${toolId}`,
      };
    }
    return tool.action(context);
  }

  private getFilteredTools(context: SidekickContext): SidekickTool[] {
    const allTools = Array.from(this.tools.values());

    // Filter by applicable apps
    const appFiltered = allTools.filter((tool) => tool.applicableApps.includes(context.currentApp));

    // If a resource is selected, further filter by applicable resource types
    if (context.selectedResource) {
      const resourceType = context.selectedResource.type;
      const resourceFiltered = appFiltered.filter((tool) =>
        tool.applicableResources.includes(resourceType),
      );
      // If resource filtering yields results, use them; otherwise fall back to app-filtered
      if (resourceFiltered.length > 0) {
        return resourceFiltered;
      }
    }

    return appFiltered;
  }

  private buildContextSummary(context: SidekickContext): string {
    const parts: string[] = [`App: ${context.currentApp}`];

    if (context.selectedResource) {
      parts.push(`Selected: ${context.selectedResource.type} "${context.selectedResource.title}"`);
    }

    if (context.recentActions.length > 0) {
      const recentAction = context.recentActions[0];
      if (recentAction) {
        parts.push(`Recent: ${recentAction}`);
      }
    }

    if (context.workspaceId) {
      parts.push(`Workspace: ${context.workspaceId}`);
    }

    return parts.join(' | ');
  }
}
