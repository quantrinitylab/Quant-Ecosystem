import { z } from 'zod';

// Agent Action Tiers
export enum AgentActionTier {
  Tier0_ReadOnly = 0,
  Tier1_DraftOnly = 1,
  Tier2_LowRisk = 2,
  Tier3_HighRisk = 3,
  Tier4_Admin = 4,
}

export const AgentActionTierSchema = z.nativeEnum(AgentActionTier);

// Tool parameter schema
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
}

// Tool Definition with permission tier
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  requiredTier: AgentActionTier;
  category: string;
  handler: (args: Record<string, unknown>) => Promise<ToolExecutionResult>;
}

// Tool execution result
export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  undoable: boolean;
  undoFn?: () => Promise<void>;
}

// Plan step
export interface PlanStep {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  tier: AgentActionTier;
  description: string;
  requiresApproval: boolean;
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'skipped';
  result?: ToolExecutionResult;
}

// Agent Plan
export interface AgentPlan {
  id: string;
  intent: string;
  steps: PlanStep[];
  estimatedCost: CostEstimate;
  createdAt: number;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
}

// Cost estimate
export interface CostEstimate {
  totalEstimatedCost: number;
  breakdown: { step: string; cost: number }[];
  currency: string;
}

// Workflow result
export interface AgentWorkflowResult {
  success: boolean;
  planId: string;
  actionsTaken: { step: string; result: ToolExecutionResult }[];
  undoableActions: string[];
  auditEntries: string[];
  totalCost: number;
}

// Safety Classification
export enum SafetyLevel {
  Safe = 'safe',
  Caution = 'caution',
  Blocked = 'blocked',
}

export interface SafetyClassificationResult {
  level: SafetyLevel;
  reason: string;
  rules_triggered: string[];
}

// Budget config
export interface BudgetConfig {
  agentId: string;
  limit: number;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  currency: string;
}

// Cost record
export interface CostRecord {
  agentId: string;
  workflowId: string;
  amount: number;
  description: string;
  timestamp: number;
}
