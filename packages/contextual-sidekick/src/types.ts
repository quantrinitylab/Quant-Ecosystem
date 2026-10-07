// ============================================================================
// Contextual Sidekick - Types
// ============================================================================

export type ResourceType =
  | 'email'
  | 'document'
  | 'message'
  | 'file'
  | 'video'
  | 'post'
  | 'event'
  | 'task'
  | 'contact';

export interface SelectedResource {
  id: string;
  type: ResourceType;
  title: string;
  metadata?: Record<string, unknown>;
}

export interface SidekickContext {
  currentApp: string;
  userId: string;
  selectedResource?: SelectedResource;
  recentActions: string[];
  workspaceId?: string;
}

export interface SidekickActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface SidekickTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  applicableApps: string[];
  applicableResources: ResourceType[];
  priority: number;
  action: (ctx: SidekickContext) => Promise<SidekickActionResult>;
}

export interface SidekickPanel {
  tools: SidekickTool[];
  contextSummary: string;
  suggestions: string[];
}

export interface AppContextMapping {
  app: string;
  defaultTools: string[];
  resourceToolMap: Map<ResourceType, string[]>;
}
