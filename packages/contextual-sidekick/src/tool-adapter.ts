// ============================================================================
// Contextual Sidekick - ToolAdapter
// ============================================================================

import type { SidekickTool } from './types';

const APP_LABELS: Record<string, string> = {
  quantmail: 'via email',
  quantchat: 'in chat',
  quantdocs: 'in docs',
  quantsync: 'as post',
  quantvault: 'to vault',
  quantmeet: 'in meeting',
  quanttasks: 'as task',
};

export class ToolAdapter {
  adaptForApp(tool: SidekickTool, targetApp: string): SidekickTool {
    const appLabel = APP_LABELS[targetApp] ?? `in ${targetApp}`;

    return {
      ...tool,
      id: `${tool.id}-${targetApp}`,
      name: `${tool.name} ${appLabel}`,
      description: `${tool.description} (${appLabel})`,
      applicableApps: [targetApp],
    };
  }

  createVariants(baseTool: SidekickTool, apps: string[]): SidekickTool[] {
    return apps.map((app) => this.adaptForApp(baseTool, app));
  }
}
