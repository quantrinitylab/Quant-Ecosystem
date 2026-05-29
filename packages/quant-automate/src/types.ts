export type TriggerType = 'schedule' | 'event' | 'webhook' | 'manual' | 'ai-condition';
export type AutomationStatus = 'active' | 'paused' | 'draft' | 'completed' | 'failed';
export type FlowControlType = 'condition' | 'branch' | 'loop' | 'retry';

export interface Automation {
  id: string;
  name: string;
  description: string;
  triggers: Trigger[];
  actions: AutomationAction[];
  flowControls: FlowControl[];
  status: AutomationStatus;
  durableState: DurableState | null;
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
  runCount: number;
}

export interface Trigger {
  id: string;
  type: TriggerType;
  config: TriggerConfig;
  enabled: boolean;
}

export type TriggerConfig =
  | { type: 'schedule'; cron: string; timezone?: string }
  | { type: 'event'; eventName: string; appId: string; filter?: Record<string, unknown> }
  | { type: 'webhook'; path: string; method: 'GET' | 'POST'; secret?: string }
  | { type: 'manual' }
  | { type: 'ai-condition'; condition: string; checkIntervalMs: number };

export interface AutomationAction {
  id: string;
  toolId: string;
  params: Record<string, unknown>;
  retryPolicy: RetryPolicy;
  timeoutMs: number;
  order: number;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
}

export interface FlowControl {
  id: string;
  type: FlowControlType;
  config: FlowControlConfig;
  afterActionId: string;
}

export type FlowControlConfig =
  | {
      type: 'condition';
      field: string;
      operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains';
      value: unknown;
      trueActionId: string;
      falseActionId: string;
    }
  | { type: 'branch'; branches: Array<{ condition: string; actionId: string }> }
  | { type: 'loop'; maxIterations: number; untilCondition?: string }
  | { type: 'retry'; maxRetries: number; backoffMs: number };

export interface DurableState {
  automationId: string;
  currentStep: number;
  checkpoints: Checkpoint[];
  resumable: boolean;
  startedAt: number;
  lastCheckpointAt: number;
}

export interface Checkpoint {
  stepIndex: number;
  timestamp: number;
  state: Record<string, unknown>;
  output: unknown;
}

export interface CronSchedule {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  raw: string;
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  triggers: Array<Omit<Trigger, 'id'>>;
  actions: Array<Omit<AutomationAction, 'id'>>;
  category: string;
}

export interface ExecutionResult {
  automationId: string;
  success: boolean;
  stepsCompleted: number;
  totalSteps: number;
  outputs: unknown[];
  error: string | null;
  duration: number;
}
