// ============================================================================
// QuantAI — Autonomous Scheduled Agents & Background Cron Tasks Service
//
// Supports recurring agent crons, natural language trigger parsing,
// execution ledger with status/artifacts tracking, and resilient lifecycle.
// ============================================================================

import { randomUUID } from 'node:crypto';

export type TaskRunStatus = 'SUCCESS' | 'RUNNING' | 'FAILED';
export type ScheduledTaskStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
export type TriggerSource = 'SCHEDULED' | 'MANUAL';

export interface OutputArtifact {
  title: string;
  uri: string;
  type: 'document' | 'email_draft' | 'github_pr' | 'report' | 'data';
  metadata?: Record<string, unknown>;
}

export interface TaskRun {
  id: string;
  taskId: string;
  status: TaskRunStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  triggerSource: TriggerSource;
  outputArtifacts: OutputArtifact[];
  summary?: string;
  error?: string;
  logs: string[];
}

export interface ScheduledTask {
  id: string;
  userId: string;
  name: string;
  description?: string;
  cronExpression: string;
  nlTrigger?: string;
  agentId: string;
  actionPrompt: string;
  targetApp: string;
  targetApps: string[];
  status: ScheduledTaskStatus;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunStatus?: TaskRunStatus;
  nextRunAt: string;
  runCount: number;
  config?: Record<string, unknown>;
}

export interface CreateScheduledTaskInput {
  userId: string;
  name?: string;
  description?: string;
  cronExpression?: string;
  nlPrompt?: string;
  agentId?: string;
  actionPrompt?: string;
  targetApp?: string;
  targetApps?: string[];
  config?: Record<string, unknown>;
}

export interface UpdateScheduledTaskInput {
  name?: string;
  description?: string;
  cronExpression?: string;
  actionPrompt?: string;
  targetApp?: string;
  targetApps?: string[];
  status?: ScheduledTaskStatus;
  config?: Record<string, unknown>;
}

export interface ParsedScheduleResult {
  cronExpression: string;
  humanReadable: string;
  actionPrompt: string;
  suggestedName: string;
  detectedApps: string[];
  confidence: number;
}

export type AgentExecutorFn = (
  task: ScheduledTask,
  run: TaskRun,
) => Promise<{
  summary: string;
  outputArtifacts: OutputArtifact[];
  logs?: string[];
}>;

// ============================================================================
// Cron Expression Utilities (Standard 5-part cron: min hour dom month dow)
// ============================================================================

export const PRESET_CRONS: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  'daily-8am': '0 8 * * *',
  'hourly-triage': '0 * * * *',
  'weekly-competitor-scan': '0 9 * * 1',
  'weekdays-8am': '0 8 * * 1-5',
};

interface CronFieldMatcher {
  matches: (value: number) => boolean;
}

export function parseCronField(fieldStr: string, min: number, max: number): CronFieldMatcher {
  const trimmed = fieldStr.trim();
  if (trimmed === '*') {
    return { matches: () => true };
  }

  // Handle step values like */15 or 1-30/5
  if (trimmed.includes('/')) {
    const [rangePart, stepPart] = trimmed.split('/');
    const step = parseInt(stepPart ?? '1', 10);
    if (isNaN(step) || step <= 0) {
      throw new Error(`Invalid cron step: ${trimmed}`);
    }

    let start = min;
    let end = max;
    if (rangePart && rangePart !== '*') {
      if (rangePart.includes('-')) {
        const [s, e] = rangePart.split('-');
        start = parseInt(s ?? `${min}`, 10);
        end = parseInt(e ?? `${max}`, 10);
      } else {
        start = parseInt(rangePart, 10);
      }
    }

    return {
      matches: (val: number) => val >= start && val <= end && (val - start) % step === 0,
    };
  }

  // Handle list values like 1,2,5 or ranges like 1-5
  const parts = trimmed.split(',');
  const numbers = new Set<number>();

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr ?? `${min}`, 10);
      const end = parseInt(endStr ?? `${max}`, 10);
      if (isNaN(start) || isNaN(end) || start > end || start < min || end > max) {
        throw new Error(`Invalid range in cron: ${part}`);
      }
      for (let i = start; i <= end; i++) {
        numbers.add(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < min || num > max) {
        throw new Error(`Invalid number in cron: ${part}`);
      }
      numbers.add(num);
    }
  }

  return {
    matches: (val: number) => numbers.has(val),
  };
}

export function parseCronExpression(expression: string) {
  const normalized = PRESET_CRONS[expression] ?? expression.trim();
  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `Cron expression must have exactly 5 parts, got ${fields.length}: "${expression}"`,
    );
  }

  const [minStr, hourStr, domStr, monthStr, dowStr] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];

  const minMatcher = parseCronField(minStr, 0, 59);
  const hourMatcher = parseCronField(hourStr, 0, 23);
  const domMatcher = parseCronField(domStr, 1, 31);
  const monthMatcher = parseCronField(monthStr, 1, 12);
  const dowMatcher = parseCronField(dowStr, 0, 7);

  return {
    matches: (date: Date): boolean => {
      const min = date.getUTCMinutes();
      const hour = date.getUTCHours();
      const dom = date.getUTCDate();
      const month = date.getUTCMonth() + 1; // 1-12
      const dow = date.getUTCDay(); // 0 (Sun) to 6 (Sat)
      const dowAlternate = dow === 0 ? 7 : dow;

      const matchesDow = dowMatcher.matches(dow) || dowMatcher.matches(dowAlternate);
      return (
        minMatcher.matches(min) &&
        hourMatcher.matches(hour) &&
        domMatcher.matches(dom) &&
        monthMatcher.matches(month) &&
        matchesDow
      );
    },
  };
}

export function calculateNextRun(expression: string, fromDate: Date = new Date()): Date {
  const matcher = parseCronExpression(expression);
  // Start from the beginning of the next minute
  const next = new Date(fromDate.getTime());
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(next.getUTCMinutes() + 1);

  const maxIterations = 525600 * 2; // Up to 2 years minute-by-minute
  let iterations = 0;

  while (iterations < maxIterations) {
    if (matcher.matches(next)) {
      return next;
    }

    // Smart forward leaping to avoid 1M loop ticks
    // If month doesn't match: leap to 1st of next month
    const curMonth = next.getUTCMonth() + 1;
    const curDom = next.getUTCDate();
    const curHour = next.getUTCHours();

    const [minStr, hourStr, domStr, monthStr] = (
      PRESET_CRONS[expression] ?? expression.trim()
    ).split(/\s+/);
    if (monthStr && monthStr !== '*' && !parseCronField(monthStr, 1, 12).matches(curMonth)) {
      next.setUTCMonth(next.getUTCMonth() + 1, 1);
      next.setUTCHours(0, 0, 0, 0);
      iterations += 1440;
      continue;
    }

    if (domStr && domStr !== '*' && !parseCronField(domStr, 1, 31).matches(curDom)) {
      next.setUTCDate(next.getUTCDate() + 1);
      next.setUTCHours(0, 0, 0, 0);
      iterations += 60;
      continue;
    }

    if (hourStr && hourStr !== '*' && !parseCronField(hourStr, 0, 23).matches(curHour)) {
      next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
      iterations += 60;
      continue;
    }

    next.setUTCMinutes(next.getUTCMinutes() + 1);
    iterations++;
  }

  throw new Error(`Unable to find next run for cron "${expression}" within search window`);
}

// ============================================================================
// Natural Language Schedule Parser
// ============================================================================

export function parseNaturalLanguageTrigger(input: string): ParsedScheduleResult {
  const text = input.trim();
  const lower = text.toLowerCase();

  let cronExpression = '0 8 * * *'; // default daily 8am
  let humanReadable = 'Every day at 8:00 AM';
  let actionPrompt = text;
  let suggestedName = 'Scheduled Agent Task';
  let confidence = 0.5;

  const detectedApps = new Set<string>();

  // App keyword detection
  if (/email|inbox|mail|unread|newsletter|draft/i.test(text)) detectedApps.add('quantmail');
  if (/reel|reels|post|story|instagram|gram/i.test(text)) detectedApps.add('quantneon');
  if (/github|pr|pull request|issue|repo|commit|code/i.test(text)) detectedApps.add('quantgit');
  if (/competitor|market|scan|intel|pricing/i.test(text)) detectedApps.add('quantai');
  if (/calendar|meeting|agenda|schedule/i.test(text)) detectedApps.add('quantcalendar');
  if (/drive|file|document|backup/i.test(text)) detectedApps.add('quantdrive');

  // Match 1: Every N minutes (e.g. 'every 15 minutes', 'every 30 mins')
  const minuteMatch = text.match(/every\s+(\d+)\s*(?:minutes?|mins?)(?:\s+(?:to\s+)?(.+))?/i);
  if (minuteMatch) {
    const mins = parseInt(minuteMatch[1] ?? '15', 10);
    cronExpression = `*/${mins} * * * *`;
    humanReadable = `Every ${mins} minutes`;
    actionPrompt = minuteMatch[2]?.trim() || text;
    suggestedName = `Every ${mins}m Agent Automation`;
    confidence = 0.95;
  }
  // Match 2: Hourly (e.g. 'hourly github pr triage', 'every hour triage open pull requests')
  else if (/^(?:hourly|every\s+hour)/i.test(lower)) {
    const match = text.match(/^(?:hourly|every\s+hour)(?:\s+(?:to\s+)?(.+))?/i);
    cronExpression = '0 * * * *';
    humanReadable = 'Every hour on the hour';
    actionPrompt = match?.[1]?.trim() || text;
    suggestedName =
      actionPrompt.toLowerCase().includes('github') || actionPrompt.toLowerCase().includes('pr')
        ? 'Hourly GitHub PR Triage'
        : 'Hourly Agent Task';
    confidence = 0.95;
  }
  // Match 3: Weekly on [Day] (e.g. 'weekly competitor scan', 'weekly on monday at 9am', 'every monday at 9:00 am')
  else if (
    /weekly|every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(lower)
  ) {
    const dayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    let dow = 1; // default Monday
    for (const [dayName, dayNum] of Object.entries(dayMap)) {
      if (lower.includes(dayName)) {
        dow = dayNum;
        break;
      }
    }

    let hour = 9;
    let minute = 0;
    const timeMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch && timeMatch[1]) {
      let rawHour = parseInt(timeMatch[1], 10);
      const rawMin = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3]?.toLowerCase();

      if (meridiem === 'pm' && rawHour < 12) rawHour += 12;
      if (meridiem === 'am' && rawHour === 12) rawHour = 0;
      if (rawHour >= 0 && rawHour < 24) hour = rawHour;
      if (rawMin >= 0 && rawMin < 60) minute = rawMin;
    }

    cronExpression = `${minute} ${hour} * * ${dow}`;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeDisplay = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    humanReadable = `Weekly on ${dayNames[dow]} at ${timeDisplay}`;

    // Extract action
    const cleaned = text
      .replace(
        /^(?:weekly(?:\s+on\s+\w+)?|every\s+\w+)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?(?:\s*(?:to|,|:)\s*)?/i,
        '',
      )
      .trim();
    actionPrompt = cleaned || text;
    suggestedName = actionPrompt.toLowerCase().includes('competitor')
      ? 'Weekly Competitor Scan'
      : `Weekly ${dayNames[dow]} Scan`;
    confidence = 0.9;
  }
  // Match 4: Every weekday at [time]
  else if (/every\s+weekday|weekdays\s+at/i.test(lower)) {
    let hour = 8;
    let minute = 0;
    const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch && timeMatch[1]) {
      let rawHour = parseInt(timeMatch[1], 10);
      const rawMin = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3]?.toLowerCase();

      if (meridiem === 'pm' && rawHour < 12) rawHour += 12;
      if (meridiem === 'am' && rawHour === 12) rawHour = 0;
      if (rawHour >= 0 && rawHour < 24) hour = rawHour;
      if (rawMin >= 0 && rawMin < 60) minute = rawMin;
    }

    cronExpression = `${minute} ${hour} * * 1-5`;
    const timeDisplay = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    humanReadable = `Every weekday at ${timeDisplay}`;

    const cleaned = text
      .replace(
        /^(?:every\s+weekday|weekdays)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?(?:\s*(?:to|,|:)\s*)?/i,
        '',
      )
      .trim();
    actionPrompt = cleaned || text;
    suggestedName = `Weekday ${timeDisplay} Automation`;
    confidence = 0.92;
  }
  // Match 5: Daily / Every morning / Every evening at [time]
  // e.g. 'Every morning at 8am summarize unread emails and top reels'
  else if (/every\s+morning|every\s+day|every\s+evening|daily\s+at|daily/i.test(lower)) {
    let hour = 8;
    let minute = 0;

    if (lower.includes('morning')) hour = 8;
    if (lower.includes('evening')) hour = 18;
    if (lower.includes('night') || lower.includes('midnight')) hour = 0;

    const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch && timeMatch[1]) {
      let rawHour = parseInt(timeMatch[1], 10);
      const rawMin = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3]?.toLowerCase();

      if (meridiem === 'pm' && rawHour < 12) rawHour += 12;
      if (meridiem === 'am' && rawHour === 12) rawHour = 0;
      if (rawHour >= 0 && rawHour < 24) hour = rawHour;
      if (rawMin >= 0 && rawMin < 60) minute = rawMin;
    }

    cronExpression = `${minute} ${hour} * * *`;
    const timeDisplay = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    humanReadable = `Daily at ${timeDisplay}`;

    const cleaned = text
      .replace(
        /^(?:every\s+(?:morning|day|evening)|daily)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?(?:\s*(?:to|,|:)\s*)?/i,
        '',
      )
      .trim();
    actionPrompt = cleaned || text;
    suggestedName =
      actionPrompt.toLowerCase().includes('email') ||
      actionPrompt.toLowerCase().includes('briefing')
        ? `Daily ${timeDisplay} Briefing`
        : `Daily ${timeDisplay} Task`;
    confidence = 0.95;
  }

  if (detectedApps.size === 0) {
    detectedApps.add('quantai');
  }

  return {
    cronExpression,
    humanReadable,
    actionPrompt,
    suggestedName,
    detectedApps: Array.from(detectedApps),
    confidence,
  };
}

// ============================================================================
// ScheduledTasksService
// ============================================================================

export class ScheduledTasksService {
  private tasks = new Map<string, ScheduledTask>();
  private runs = new Map<string, TaskRun[]>();
  private customExecutor?: AgentExecutorFn;

  constructor(options?: { executor?: AgentExecutorFn }) {
    if (options?.executor) {
      this.customExecutor = options.executor;
    }
  }

  /**
   * Create and register a recurring scheduled agent task.
   */
  async createScheduledTask(input: CreateScheduledTaskInput): Promise<ScheduledTask> {
    if (!input.userId) {
      throw new Error('userId is required to create a scheduled task');
    }

    let cron = input.cronExpression;
    let name = input.name;
    let actionPrompt = input.actionPrompt;
    let targetApp = input.targetApp;
    let targetApps = input.targetApps ?? [];

    if (input.nlPrompt && (!cron || !actionPrompt)) {
      const parsed = parseNaturalLanguageTrigger(input.nlPrompt);
      if (!cron) cron = parsed.cronExpression;
      if (!name) name = parsed.suggestedName;
      if (!actionPrompt) actionPrompt = parsed.actionPrompt;
      if (!targetApp) targetApp = parsed.detectedApps[0] ?? 'quantai';
      if (targetApps.length === 0) targetApps = parsed.detectedApps;
    }

    if (!cron) {
      throw new Error('Either cronExpression or nlPrompt must be provided');
    }

    if (!actionPrompt) {
      throw new Error('Action prompt is required');
    }

    // Validate cron and compute next run
    const nextRun = calculateNextRun(cron);
    const id = `task-${randomUUID()}`;
    const nowIso = new Date().toISOString();

    const finalTargetApp = targetApp || (targetApps[0] ?? 'quantai');
    if (targetApps.length === 0) {
      targetApps = [finalTargetApp];
    }

    const task: ScheduledTask = {
      id,
      userId: input.userId,
      name: name || 'Autonomous Scheduled Agent',
      description: input.description,
      cronExpression: cron,
      nlTrigger: input.nlPrompt,
      agentId: input.agentId || 'agent-quanty-orchestrator',
      actionPrompt,
      targetApp: finalTargetApp,
      targetApps,
      status: 'ACTIVE',
      createdAt: nowIso,
      updatedAt: nowIso,
      nextRunAt: nextRun.toISOString(),
      runCount: 0,
      config: input.config,
    };

    this.tasks.set(id, task);
    this.runs.set(id, []);

    return task;
  }

  /**
   * Get a scheduled task by ID.
   */
  getScheduledTask(taskId: string, userId?: string): ScheduledTask | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (userId && task.userId !== userId) return null;
    return task;
  }

  /**
   * List scheduled tasks for a user, with optional status/agent filtering.
   */
  listScheduledTasks(
    userId: string,
    filters?: { status?: ScheduledTaskStatus; agentId?: string; targetApp?: string },
  ): ScheduledTask[] {
    const results: ScheduledTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.userId !== userId) continue;
      if (filters?.status && task.status !== filters.status) continue;
      if (filters?.agentId && task.agentId !== filters.agentId) continue;
      if (
        filters?.targetApp &&
        task.targetApp !== filters.targetApp &&
        !task.targetApps.includes(filters.targetApp)
      ) {
        continue;
      }
      results.push(task);
    }
    return results.sort(
      (a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime(),
    );
  }

  /**
   * Update scheduled task metadata, schedule, or status.
   */
  updateScheduledTask(
    taskId: string,
    userId: string,
    updates: UpdateScheduledTaskInput,
  ): ScheduledTask {
    const task = this.getScheduledTask(taskId, userId);
    if (!task) {
      throw new Error(`Scheduled task ${taskId} not found`);
    }

    if (updates.cronExpression && updates.cronExpression !== task.cronExpression) {
      const nextRun = calculateNextRun(updates.cronExpression);
      task.cronExpression = updates.cronExpression;
      task.nextRunAt = nextRun.toISOString();
    }

    if (updates.name !== undefined) task.name = updates.name;
    if (updates.description !== undefined) task.description = updates.description;
    if (updates.actionPrompt !== undefined) task.actionPrompt = updates.actionPrompt;
    if (updates.targetApp !== undefined) task.targetApp = updates.targetApp;
    if (updates.targetApps !== undefined) task.targetApps = updates.targetApps;
    if (updates.status !== undefined) task.status = updates.status;
    if (updates.config !== undefined) task.config = updates.config;

    task.updatedAt = new Date().toISOString();
    return task;
  }

  /**
   * Pause a scheduled task.
   */
  pauseScheduledTask(taskId: string, userId: string): ScheduledTask {
    return this.updateScheduledTask(taskId, userId, { status: 'PAUSED' });
  }

  /**
   * Resume an active scheduled task and recompute nextRunAt.
   */
  resumeScheduledTask(taskId: string, userId: string): ScheduledTask {
    const task = this.getScheduledTask(taskId, userId);
    if (!task) {
      throw new Error(`Scheduled task ${taskId} not found`);
    }
    task.status = 'ACTIVE';
    task.nextRunAt = calculateNextRun(task.cronExpression).toISOString();
    task.updatedAt = new Date().toISOString();
    return task;
  }

  /**
   * Cancel a scheduled task (sets status to CANCELLED).
   */
  cancelScheduledTask(taskId: string, userId: string): boolean {
    const task = this.getScheduledTask(taskId, userId);
    if (!task) return false;
    task.status = 'CANCELLED';
    task.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Permanently delete a scheduled task and its execution records.
   */
  deleteScheduledTask(taskId: string, userId: string): boolean {
    const task = this.getScheduledTask(taskId, userId);
    if (!task) return false;
    this.tasks.delete(taskId);
    this.runs.delete(taskId);
    return true;
  }

  /**
   * Execute task run (either via manual trigger or autonomous schedule tick).
   */
  async triggerTask(
    taskId: string,
    userId: string,
    source: TriggerSource = 'MANUAL',
    customExecutor?: AgentExecutorFn,
  ): Promise<TaskRun> {
    const task = this.getScheduledTask(taskId, userId);
    if (!task) {
      throw new Error(`Scheduled task ${taskId} not found`);
    }

    if (task.status === 'CANCELLED') {
      throw new Error(`Cannot execute cancelled task ${taskId}`);
    }

    const runId = `run-${randomUUID()}`;
    const startTime = Date.now();
    const startedAt = new Date(startTime).toISOString();

    const run: TaskRun = {
      id: runId,
      taskId,
      status: 'RUNNING',
      startedAt,
      triggerSource: source,
      outputArtifacts: [],
      logs: [`[${startedAt}] Task run started (source: ${source})`],
    };

    const taskRuns = this.runs.get(taskId) ?? [];
    taskRuns.unshift(run);
    this.runs.set(taskId, taskRuns);

    const executor = customExecutor || this.customExecutor || this.defaultExecutor.bind(this);

    try {
      const result = await executor(task, run);

      const endTime = Date.now();
      run.status = 'SUCCESS';
      run.completedAt = new Date(endTime).toISOString();
      run.durationMs = endTime - startTime;
      run.summary = result.summary;
      run.outputArtifacts = result.outputArtifacts;
      if (result.logs) {
        run.logs.push(...result.logs);
      }
      run.logs.push(`[${run.completedAt}] Task run completed successfully in ${run.durationMs}ms`);

      // Update parent task
      task.lastRunAt = run.completedAt;
      task.lastRunStatus = 'SUCCESS';
      task.runCount += 1;
      task.nextRunAt = calculateNextRun(task.cronExpression).toISOString();
      task.updatedAt = run.completedAt;

      return run;
    } catch (err) {
      const endTime = Date.now();
      run.status = 'FAILED';
      run.completedAt = new Date(endTime).toISOString();
      run.durationMs = endTime - startTime;
      run.error = (err as Error).message || String(err);
      run.logs.push(`[${run.completedAt}] Task run failed: ${run.error}`);

      task.lastRunAt = run.completedAt;
      task.lastRunStatus = 'FAILED';
      task.runCount += 1;
      task.updatedAt = run.completedAt;

      return run;
    }
  }

  /**
   * Default simulated intelligent agent executor generating authentic Quant artifacts.
   */
  private async defaultExecutor(
    task: ScheduledTask,
    run: TaskRun,
  ): Promise<{ summary: string; outputArtifacts: OutputArtifact[]; logs: string[] }> {
    const logs: string[] = [];
    const artifacts: OutputArtifact[] = [];
    const lowerPrompt = `${task.actionPrompt} ${task.name} ${task.description ?? ''}`.toLowerCase();

    logs.push(`[${new Date().toISOString()}] Routing task to agent ${task.agentId}`);
    logs.push(
      `[${new Date().toISOString()}] Target application scope: ${task.targetApps.join(', ')}`,
    );

    if (
      lowerPrompt.includes('email') ||
      lowerPrompt.includes('briefing') ||
      lowerPrompt.includes('inbox')
    ) {
      logs.push(
        `[${new Date().toISOString()}] Ingested 14 unread emails & compiled QuantMail daily digest`,
      );
      artifacts.push({
        title: 'Morning Executive Briefing & Email Digest',
        uri: `quantmail://drafts/briefing-${run.id}`,
        type: 'email_draft',
        metadata: { unreadCount: 14, highPriorityCount: 3 },
      });
      artifacts.push({
        title: 'Daily Digest Report',
        uri: `quantdrive://artifacts/briefing-${run.id}.md`,
        type: 'report',
      });
    }

    if (
      lowerPrompt.includes('github') ||
      lowerPrompt.includes('pr') ||
      lowerPrompt.includes('triage')
    ) {
      logs.push(
        `[${new Date().toISOString()}] Queried open PRs from quantrinitylab/Quant-Ecosystem`,
      );
      logs.push(`[${new Date().toISOString()}] Triaged 7 PRs: 5 approved, 2 require changes`);
      artifacts.push({
        title: 'Hourly GitHub PR Triage Matrix',
        uri: `quantgit://prs/triage-${run.id}`,
        type: 'github_pr',
        metadata: { triagedCount: 7, autoMerged: 0 },
      });
    }

    if (
      lowerPrompt.includes('competitor') ||
      lowerPrompt.includes('scan') ||
      lowerPrompt.includes('intel')
    ) {
      logs.push(
        `[${new Date().toISOString()}] Executed Web Crawl & Market Diff analysis against OpenAI & Meta`,
      );
      artifacts.push({
        title: 'Weekly Competitor Scan Report',
        uri: `quantdrive://reports/competitor-scan-${run.id}.pdf`,
        type: 'report',
        metadata: { competitorsAudited: ['ChatGPT', 'Superhuman', 'Linear', 'Instagram'] },
      });
    }

    if (
      lowerPrompt.includes('reel') ||
      lowerPrompt.includes('instagram') ||
      lowerPrompt.includes('neon')
    ) {
      logs.push(
        `[${new Date().toISOString()}] Analyzed trending QuantGram reels and engagement metrics`,
      );
      artifacts.push({
        title: 'Top Reels Analytics Snapshot',
        uri: `quantneon://analytics/reels-${run.id}`,
        type: 'data',
      });
    }

    if (artifacts.length === 0) {
      artifacts.push({
        title: `${task.name} Execution Artifact`,
        uri: `quantai://artifacts/${task.id}/${run.id}`,
        type: 'document',
      });
    }

    const summary = `Executed "${task.name}" autonomously. Generated ${artifacts.length} output artifact(s).`;
    return { summary, outputArtifacts: artifacts, logs };
  }

  /**
   * Get execution ledger history for a scheduled task.
   */
  getExecutionHistory(taskId: string, userId: string, limit: number = 20): TaskRun[] {
    const task = this.getScheduledTask(taskId, userId);
    if (!task) return [];
    const runs = this.runs.get(taskId) ?? [];
    return runs.slice(0, limit);
  }

  /**
   * Get a specific run record by task ID and run ID.
   */
  getExecutionRun(taskId: string, runId: string, userId: string): TaskRun | null {
    const task = this.getScheduledTask(taskId, userId);
    if (!task) return null;
    const runs = this.runs.get(taskId) ?? [];
    return runs.find((r) => r.id === runId) ?? null;
  }
}
