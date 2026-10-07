// ============================================================================
// quantai — agent surface DTOs (Layer 5 request/response contracts)
// ============================================================================
//
// Frontend-facing data shapes for the agent api-client hooks. These mirror the
// JSON the quantai backend agent routes return (see apps/quantai/backend/routes/
// {agent-runtime,agent-swarm,quant-tools,browser-agent,code-agent,user-owned-ai})
// and are intentionally decoupled from the engine packages' internal types so a
// backend refactor never forces a frontend type change. Every hook is typed
// against the `{ success, data }` envelope via `APIResponse<T>` from the SDK.

// --- agent-runtime -----------------------------------------------------------

export type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentSubTask {
  id: string;
  description: string;
  requiredPermission: string;
  dependencies: string[];
}

export interface AgentTask {
  id: string;
  description: string;
  status: AgentTaskStatus;
  subtasks: AgentSubTask[];
  startedAt: number;
  completedAt?: number;
}

export interface CreateAgentTaskInput {
  task: string;
}

export interface RunningAgent {
  id: string;
}

export interface RunningAgentsResponse {
  agents: RunningAgent[];
}

// --- agent-swarm -------------------------------------------------------------

export type SwarmGoalState =
  | 'pending'
  | 'decomposing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'paused'
  | 'cancelled';

export interface SwarmBudget {
  maxTimeMs: number;
  maxTokens: number;
  maxCostCents: number;
}

export interface SwarmSubGoal {
  id: string;
  parentId: string;
  description: string;
  assignedAgent: string | null;
  state: SwarmGoalState;
  priority: number;
  dependsOn: string[];
  retryCount: number;
}

export interface SwarmGoal {
  id: string;
  description: string;
  state: SwarmGoalState;
  subGoals: SwarmSubGoal[];
  budget: SwarmBudget;
  createdAt: number;
}

export interface CreateSwarmGoalInput {
  description: string;
  budget: SwarmBudget;
  subGoals?: string[];
}

export interface SwarmGoalProgress {
  completed: number;
  total: number;
  [key: string]: unknown;
}

// --- quant-tools -------------------------------------------------------------

export interface ToolCatalogEntry {
  id: string;
  name: string;
  appId: string;
  description: string;
}

export interface ToolCatalogResponse {
  tools: ToolCatalogEntry[];
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
  requiredPermission: number;
  description: string;
}

export interface ToolPlanInput {
  input: string;
}

export interface ToolExecuteInput {
  input: string;
  dryRun?: boolean;
}

export interface ToolExecutionResult {
  success: boolean;
  data: unknown;
  error?: string;
  executionId: string;
  toolId: string;
  latencyMs: number;
}

export interface ToolExecuteResponse {
  results: ToolExecutionResult[];
}

// --- browser-agent -----------------------------------------------------------

export type BrowserSessionStatus = 'active' | 'closed';

export interface BrowserSession {
  id: string;
  userId: string;
  siteUrl: string;
  status: BrowserSessionStatus;
  startedAt: number;
  lastActivityAt: number;
}

export interface BrowserSessionsResponse {
  sessions: BrowserSession[];
}

export interface CreateBrowserSessionInput {
  siteUrl: string;
}

export interface EndBrowserSessionResponse {
  id: string;
  status: 'closed';
}

// --- code-agent --------------------------------------------------------------

export interface CodeAnalyzeInput {
  paths: string[];
}

export interface RepoModel {
  languages: string[];
  frameworks: string[];
  buildSystem?: string;
  entryPoints: string[];
  testPaths: string[];
  [key: string]: unknown;
}

// --- user-owned-ai -----------------------------------------------------------

export interface OwnedModel {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  latencyProfile: 'fast' | 'balanced' | 'quality';
  localCompatible: boolean;
  maxContextLength: number;
  tags: string[];
  pricing: {
    inputPer1kTokens: number;
    outputPer1kTokens: number;
    currency: string;
  };
}

export interface OwnedModelsResponse {
  models: OwnedModel[];
}

export interface OwnedModelsFilter {
  provider?: string;
  local?: boolean;
}

export interface CompareModelsInput {
  modelIds: string[];
}

export interface CompareModelsResponse {
  models: OwnedModel[];
}
