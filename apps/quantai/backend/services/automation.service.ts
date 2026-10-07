import { createAppError } from '@quant/server-core';

// ---------------------------------------------------------------------------
// Public types (mirror the frontend `Automation` contract in
// apps/quantai/src/types/index.ts so the API shape matches exactly).
// ---------------------------------------------------------------------------

export type AutomationTriggerType = 'schedule' | 'event' | 'condition' | 'webhook' | 'manual';

export interface AutomationTriggerConfig {
  type: AutomationTriggerType;
  config: Record<string, unknown>;
  schedule?: string;
  event?: string;
  condition?: string;
  webhook?: { url: string; secret: string };
}

export interface AutomationAction {
  id: string;
  type: string;
  app?: string;
  params: Record<string, unknown>;
  order: number;
  retryOnFail: boolean;
  timeout: number;
}

export interface AutomationCondition {
  field: string;
  operator: 'equals' | 'not-equals' | 'contains' | 'gt' | 'lt' | 'exists';
  value: unknown;
}

export interface Automation {
  id: string;
  userId: string;
  name: string;
  description: string;
  trigger: AutomationTriggerConfig;
  actions: AutomationAction[];
  conditions: AutomationCondition[];
  isActive: boolean;
  executionCount: number;
  lastExecuted?: string;
  createdAt: string;
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  trigger: AutomationTriggerConfig;
  actions?: AutomationActionInput[];
  conditions?: AutomationConditionInput[];
  isActive?: boolean;
}

export interface UpdateAutomationInput {
  name?: string;
  description?: string;
  trigger?: AutomationTriggerConfig;
  actions?: AutomationActionInput[];
  conditions?: AutomationConditionInput[];
  isActive?: boolean;
}

/** Loosened condition shape accepted from the API (value may be omitted). */
export interface AutomationConditionInput {
  field: string;
  operator: AutomationCondition['operator'];
  value?: unknown;
}

/** Loosened action shape accepted from the API; missing fields are defaulted. */
export interface AutomationActionInput {
  id?: string;
  type: string;
  app?: string;
  params?: Record<string, unknown>;
  order?: number;
  retryOnFail?: boolean;
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Execution: a durable run with per-step checkpoints. Actual side-effects are
// performed by an injected ActionDispatcher (wired to the cross-app tool
// orchestrator in the route). The dispatcher is honest about unmapped actions
// rather than fabricating success.
// ---------------------------------------------------------------------------

export interface ActionDispatchResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface ActionDispatcher {
  dispatch(
    action: AutomationAction,
    ctx: { userId: string; automationId: string; runId: string },
  ): Promise<ActionDispatchResult>;
}

export interface RunCheckpoint {
  stepIndex: number;
  actionId: string;
  type: string;
  status: 'completed' | 'failed';
  output?: unknown;
  error?: string;
  at: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  userId: string;
  status: 'running' | 'completed' | 'failed';
  currentStep: number;
  checkpoints: RunCheckpoint[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

// ---------------------------------------------------------------------------
// Structural Prisma slice. Declared structurally so the service is unit
// testable with a lightweight fake while `@quant/database` satisfies the same
// shape at runtime.
// ---------------------------------------------------------------------------

interface AutomationRow {
  id: string;
  userId: string;
  name: string;
  description: string;
  trigger: unknown;
  actions: unknown;
  conditions: unknown;
  isActive: boolean;
  executionCount: number;
  lastExecutedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface AutomationRunRow {
  id: string;
  automationId: string;
  userId: string;
  status: string;
  currentStep: number;
  checkpoints: unknown;
  error: string | null;
  startedAt: Date | string;
  finishedAt: Date | string | null;
}

export interface AutomationPrismaClient {
  aiAutomation: {
    findMany: (args: Record<string, unknown>) => Promise<AutomationRow[]>;
    findUnique: (args: { where: { id: string } }) => Promise<AutomationRow | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<AutomationRow>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<AutomationRow>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
  aiAutomationRun: {
    create: (args: { data: Record<string, unknown> }) => Promise<AutomationRunRow>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<AutomationRunRow>;
  };
}

const MAX_NAME = 200;
const MAX_DESCRIPTION = 2000;
const MAX_ACTIONS = 50;

const VALID_TRIGGERS: ReadonlySet<AutomationTriggerType> = new Set([
  'schedule',
  'event',
  'condition',
  'webhook',
  'manual',
]);

export class AutomationService {
  constructor(
    private readonly prisma: AutomationPrismaClient,
    private readonly dispatcher?: ActionDispatcher,
  ) {}

  // ----- serialization helpers ---------------------------------------------

  private asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private asTrigger(value: unknown): AutomationTriggerConfig {
    if (value && typeof value === 'object') {
      const v = value as Partial<AutomationTriggerConfig>;
      const type = (v.type ?? 'manual') as AutomationTriggerType;
      return {
        type: VALID_TRIGGERS.has(type) ? type : 'manual',
        config: (v.config as Record<string, unknown>) ?? {},
        ...(v.schedule !== undefined ? { schedule: v.schedule } : {}),
        ...(v.event !== undefined ? { event: v.event } : {}),
        ...(v.condition !== undefined ? { condition: v.condition } : {}),
        ...(v.webhook !== undefined ? { webhook: v.webhook } : {}),
      };
    }
    return { type: 'manual', config: {} };
  }

  private rowToAutomation(row: AutomationRow): Automation {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      trigger: this.asTrigger(row.trigger),
      actions: this.asArray<AutomationAction>(row.actions).sort((a, b) => a.order - b.order),
      conditions: this.asArray<AutomationCondition>(row.conditions),
      isActive: row.isActive,
      executionCount: row.executionCount,
      ...(row.lastExecutedAt ? { lastExecuted: new Date(row.lastExecutedAt).toISOString() } : {}),
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  private rowToRun(row: AutomationRunRow): AutomationRun {
    return {
      id: row.id,
      automationId: row.automationId,
      userId: row.userId,
      status: row.status as AutomationRun['status'],
      currentStep: row.currentStep,
      checkpoints: this.asArray<RunCheckpoint>(row.checkpoints),
      ...(row.error ? { error: row.error } : {}),
      startedAt: new Date(row.startedAt).toISOString(),
      ...(row.finishedAt ? { finishedAt: new Date(row.finishedAt).toISOString() } : {}),
    };
  }

  private normalizeActions(actions?: AutomationActionInput[]): AutomationAction[] {
    if (!actions) return [];
    return actions.slice(0, MAX_ACTIONS).map((a, i) => ({
      id: a.id || `action-${i + 1}`,
      type: String(a.type ?? '').trim(),
      ...(a.app ? { app: a.app } : {}),
      params: a.params ?? {},
      order: typeof a.order === 'number' ? a.order : i,
      retryOnFail: Boolean(a.retryOnFail),
      timeout: typeof a.timeout === 'number' && a.timeout > 0 ? a.timeout : 30000,
    }));
  }

  // ----- ownership ----------------------------------------------------------

  private async getOwnedRow(id: string, userId: string): Promise<AutomationRow> {
    const row = await this.prisma.aiAutomation.findUnique({ where: { id } });
    if (!row) {
      throw createAppError('Automation not found', 404, 'AUTOMATION_NOT_FOUND');
    }
    if (row.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }
    return row;
  }

  // ----- CRUD ---------------------------------------------------------------

  async list(userId: string): Promise<Automation[]> {
    const rows = await this.prisma.aiAutomation.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return rows.map((r) => this.rowToAutomation(r));
  }

  async get(id: string, userId: string): Promise<Automation> {
    return this.rowToAutomation(await this.getOwnedRow(id, userId));
  }

  async create(userId: string, input: CreateAutomationInput): Promise<Automation> {
    const name = input.name?.trim();
    if (!name) {
      throw createAppError('Name is required', 400, 'INVALID_AUTOMATION');
    }
    if (name.length > MAX_NAME) {
      throw createAppError('Name is too long', 400, 'INVALID_AUTOMATION');
    }
    const description = (input.description ?? '').trim();
    if (description.length > MAX_DESCRIPTION) {
      throw createAppError('Description is too long', 400, 'INVALID_AUTOMATION');
    }

    const row = await this.prisma.aiAutomation.create({
      data: {
        userId,
        name,
        description,
        trigger: this.asTrigger(input.trigger),
        actions: this.normalizeActions(input.actions),
        conditions: this.asArray<AutomationCondition>(input.conditions),
        isActive: input.isActive ?? true,
      },
    });
    return this.rowToAutomation(row);
  }

  async update(id: string, userId: string, input: UpdateAutomationInput): Promise<Automation> {
    await this.getOwnedRow(id, userId);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > MAX_NAME) {
        throw createAppError('Invalid name', 400, 'INVALID_AUTOMATION');
      }
      data['name'] = name;
    }
    if (input.description !== undefined) {
      const description = input.description.trim();
      if (description.length > MAX_DESCRIPTION) {
        throw createAppError('Description is too long', 400, 'INVALID_AUTOMATION');
      }
      data['description'] = description;
    }
    if (input.trigger !== undefined) data['trigger'] = this.asTrigger(input.trigger);
    if (input.actions !== undefined) data['actions'] = this.normalizeActions(input.actions);
    if (input.conditions !== undefined) {
      data['conditions'] = this.asArray<AutomationCondition>(input.conditions);
    }
    if (input.isActive !== undefined) data['isActive'] = input.isActive;

    const row = await this.prisma.aiAutomation.update({ where: { id }, data });
    return this.rowToAutomation(row);
  }

  async toggle(id: string, userId: string): Promise<Automation> {
    const current = await this.getOwnedRow(id, userId);
    const row = await this.prisma.aiAutomation.update({
      where: { id },
      data: { isActive: !current.isActive },
    });
    return this.rowToAutomation(row);
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.getOwnedRow(id, userId);
    await this.prisma.aiAutomation.delete({ where: { id } });
  }

  // ----- durable execution --------------------------------------------------

  /**
   * Execute an automation's actions in order, recording a durable run with a
   * checkpoint per step. Side-effects are dispatched through the injected
   * ActionDispatcher; without one, the run is recorded but each step is marked
   * failed with NO_DISPATCHER rather than fabricating success.
   */
  async execute(id: string, userId: string): Promise<AutomationRun> {
    const automation = this.rowToAutomation(await this.getOwnedRow(id, userId));

    if (!automation.isActive) {
      throw createAppError('Cannot execute an inactive automation', 409, 'AUTOMATION_INACTIVE');
    }

    const runRow = await this.prisma.aiAutomationRun.create({
      data: { automationId: id, userId, status: 'running', currentStep: 0, checkpoints: [] },
    });

    const actions = [...automation.actions].sort((a, b) => a.order - b.order);
    const checkpoints: RunCheckpoint[] = [];
    let runStatus: AutomationRun['status'] = 'completed';
    let runError: string | undefined;

    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i]!;
      const result = await this.dispatchOne(action, {
        userId,
        automationId: id,
        runId: runRow.id,
      });

      checkpoints.push({
        stepIndex: i,
        actionId: action.id,
        type: action.type,
        status: result.success ? 'completed' : 'failed',
        ...(result.output !== undefined ? { output: result.output } : {}),
        ...(result.error ? { error: result.error } : {}),
        at: new Date().toISOString(),
      });

      // Persist progress after each step so an interrupted run is recoverable.
      await this.prisma.aiAutomationRun.update({
        where: { id: runRow.id },
        data: { currentStep: i + 1, checkpoints },
      });

      if (!result.success) {
        runStatus = 'failed';
        runError = result.error ?? `Step ${i + 1} (${action.type}) failed`;
        break;
      }
    }

    const finishedRow = await this.prisma.aiAutomationRun.update({
      where: { id: runRow.id },
      data: {
        status: runStatus,
        checkpoints,
        ...(runError ? { error: runError } : {}),
        finishedAt: new Date(),
      },
    });

    // Record the execution against the automation (count + last run time).
    await this.prisma.aiAutomation.update({
      where: { id },
      data: { executionCount: automation.executionCount + 1, lastExecutedAt: new Date() },
    });

    return this.rowToRun(finishedRow);
  }

  private async dispatchOne(
    action: AutomationAction,
    ctx: { userId: string; automationId: string; runId: string },
  ): Promise<ActionDispatchResult> {
    if (!this.dispatcher) {
      return { success: false, error: 'NO_DISPATCHER: no action dispatcher configured' };
    }
    const attempts = action.retryOnFail ? 2 : 1;
    let last: ActionDispatchResult = { success: false, error: 'not executed' };
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        last = await this.dispatcher.dispatch(action, ctx);
        if (last.success) return last;
      } catch (err) {
        last = { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return last;
  }
}
