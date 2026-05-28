import { z } from 'zod';

// ============================================================
// Trigger Types
// ============================================================

export type TriggerType = 'schedule' | 'event' | 'webhook' | 'manual' | 'ai_condition';

export interface CronSchedule {
  expression: string;
  timezone?: string;
}

export interface ScheduleTrigger {
  type: 'schedule';
  cron: CronSchedule;
}

export interface EventTrigger {
  type: 'event';
  eventName: string;
  filters?: Record<string, unknown>;
}

export interface WebhookTrigger {
  type: 'webhook';
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  secret?: string;
}

export interface ManualTrigger {
  type: 'manual';
  label?: string;
}

export interface AiConditionTrigger {
  type: 'ai_condition';
  condition: string;
  evaluationInterval?: number;
}

export type AutomationTrigger =
  | ScheduleTrigger
  | EventTrigger
  | WebhookTrigger
  | ManualTrigger
  | AiConditionTrigger;

// ============================================================
// Step Types
// ============================================================

export type StepConditionOperator = 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'exists';

export interface StepCondition {
  field: string;
  operator: StepConditionOperator;
  value: unknown;
}

export interface InputMapping {
  [key: string]: string | number | boolean | InputMapping;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export type OnErrorMode = 'fail' | 'skip' | 'retry';

export interface AutomationStep {
  id: string;
  toolId: string;
  name: string;
  description?: string;
  inputMapping?: InputMapping;
  condition?: StepCondition;
  retryPolicy?: RetryPolicy;
  onError?: OnErrorMode;
  timeout?: number;
}

// ============================================================
// Run Result Types
// ============================================================

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StepRunResult {
  stepId: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
  retryCount: number;
}

export type AutomationRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export interface RunResult {
  automationId: string;
  runId: string;
  status: AutomationRunStatus;
  startedAt: number;
  completedAt?: number;
  stepResults: StepRunResult[];
  error?: string;
}

// ============================================================
// Automation State (Durable Execution)
// ============================================================

export interface AutomationCheckpoint {
  runId: string;
  automationId: string;
  currentStepIndex: number;
  stepResults: StepRunResult[];
  status: AutomationRunStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationState {
  automationId: string;
  lastRunId?: string;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
  checkpoints: Map<string, AutomationCheckpoint>;
}

// ============================================================
// Core Automation
// ============================================================

export type AutomationStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface Automation {
  id: string;
  name: string;
  description?: string;
  status: AutomationStatus;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  tags?: string[];
}

// ============================================================
// Tool Registry Compatible Interface
// ============================================================

export interface ToolExecuteResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolExecutor {
  execute(toolId: string, input: unknown): Promise<ToolExecuteResult>;
}

// ============================================================
// Trigger Context
// ============================================================

export interface TriggerContext {
  currentTime: number;
  event?: { name: string; payload: Record<string, unknown> };
  webhook?: { path: string; method: string; headers: Record<string, string> };
  aiEvaluation?: { result: boolean; confidence: number };
}

// ============================================================
// Engine Interface
// ============================================================

export interface AutomationEngine {
  create(automation: Omit<Automation, 'id' | 'createdAt' | 'updatedAt'>): Automation;
  execute(automationId: string): Promise<RunResult>;
  pause(automationId: string): void;
  resume(automationId: string): void;
  getHistory(automationId: string): RunResult[];
  get(automationId: string): Automation | undefined;
  list(): Automation[];
}

// ============================================================
// NL Builder Types
// ============================================================

export type NLParseConfidence = 'high' | 'medium' | 'low';

export interface NLParseResult {
  automation: Partial<Automation>;
  confidence: NLParseConfidence;
  suggestions?: string[];
}

// ============================================================
// Zod Schemas for Validation
// ============================================================

export const CronScheduleSchema = z.object({
  expression: z.string().min(9),
  timezone: z.string().optional(),
});

export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(10),
  baseDelayMs: z.number().min(100),
  maxDelayMs: z.number().optional(),
  backoffMultiplier: z.number().optional(),
});

export const AutomationStepSchema = z.object({
  id: z.string().min(1),
  toolId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  inputMapping: z.record(z.unknown()).optional(),
  condition: z
    .object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'contains', 'gt', 'lt', 'exists']),
      value: z.unknown(),
    })
    .optional(),
  retryPolicy: RetryPolicySchema.optional(),
  onError: z.enum(['fail', 'skip', 'retry']).optional(),
  timeout: z.number().optional(),
});
