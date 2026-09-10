export type GoalState =
  | 'pending'
  | 'decomposing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'paused'
  | 'cancelled';
export interface BudgetConfig {
  maxTimeMs: number;
  maxTokens: number;
  maxCostCents: number;
}
export interface SwarmGoal {
  id: string;
  description: string;
  state: GoalState;
  subGoals: SubGoal[];
  budget: BudgetConfig;
  createdAt: number;
  userId?: string;
  tenantId?: string;
}
export interface SubGoal {
  id: string;
  parentId: string;
  description: string;
  assignedAgent: string | null;
  state: GoalState;
  priority: number;
  dependsOn: string[];
  retryCount: number;
}
export interface AgentAssignment {
  agentId: string;
  subGoalId: string;
  assignedAt: number;
  completedAt: number | null;
}
export interface SwarmAuditEntry {
  goalId: string;
  agentId: string;
  action: string;
  timestamp: number;
  detail: string | AuditDetail;
  severity?: AuditSeverity;
}
export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';
export interface AuditDetail {
  message: string;
  metadata?: Record<string, unknown>;
}
export interface MessageBusEvent {
  id: string;
  topic: string;
  payload: unknown;
  sender: string;
  timestamp: number;
  acked: boolean;
}
export interface RetryConfig {
  maxRetries: number;
  backoffFactor: number;
  initialDelayMs: number;
}
export type ObservationHook = {
  onStateChange?: (goalId: string, from: GoalState, to: GoalState) => void;
  onProgress?: (goalId: string, completed: number, total: number) => void;
  onBudgetAlert?: (goalId: string, usage: { tokens: number; cost: number; time: number }) => void;
};
export type ConflictResolution = 'last-writer-wins' | 'merge';
export interface SwarmMessage {
  id: string;
  topic: string;
  payload: unknown;
  sender: string;
  timestamp: number;
}
