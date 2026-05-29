export type PermissionTier = 0 | 1 | 2 | 3; // 0=Auto, 1=Notify, 2=Confirm, 3=Admin

export interface ToolInputSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required: boolean;
    description: string;
    default?: unknown;
  };
}

export interface ToolOutputSchema {
  type: string;
  description: string;
  fields?: Record<string, { type: string; description: string }>;
}

export interface UndoRecipe {
  toolId: string;
  params: Record<string, unknown>;
  description: string;
  ttlMs: number;
}

export interface ToolDefinition {
  id: string;
  appId: string;
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  outputSchema: ToolOutputSchema;
  permissionTier: PermissionTier;
  costEstimate: 'free' | 'low' | 'medium' | 'high';
  undoRecipe: UndoRecipe | null;
  tags: string[];
}

export interface ToolExecutionContext {
  userId: string;
  sessionId: string;
  permissions: PermissionTier;
  dryRun: boolean;
  metadata?: Record<string, string>;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  executionId: string;
  toolId: string;
  latencyMs: number;
}

export interface ToolPlanStep {
  stepId: string;
  toolId: string;
  params: Record<string, unknown>;
  dependsOn: string[];
  outputKey: string;
}

export interface ToolPlan {
  id: string;
  steps: ToolPlanStep[];
  estimatedCost: string;
  requiredPermission: PermissionTier;
  description: string;
}

export interface IntentMatch {
  toolId: string;
  confidence: number;
  extractedParams: Record<string, unknown>;
  appId: string;
}

export interface AuditEntry {
  id: string;
  executionId: string;
  toolId: string;
  userId: string;
  timestamp: number;
  action: 'invoke' | 'success' | 'failure' | 'undo';
  details: Record<string, unknown>;
}

export interface UndoAction {
  executionId: string;
  recipe: UndoRecipe;
  createdAt: number;
  expiresAt: number;
  executed: boolean;
}

export interface MCPToolEntry {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  permissionTier: PermissionTier;
}
