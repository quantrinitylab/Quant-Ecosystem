// ============================================================================
// QuantAI — Autonomous Scheduled Agents & Background Cron Tasks Service Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ScheduledTasksService,
  parseCronField,
  parseCronExpression,
  calculateNextRun,
  parseNaturalLanguageTrigger,
} from '../services/scheduled-tasks.service';

describe('ScheduledTasksService — Cron Engine & Natural Language Parser', () => {
  describe('Cron Field & Expression Parsing', () => {
    it('matches wildcard fields correctly', () => {
      const matcher = parseCronField('*', 0, 59);
      expect(matcher.matches(0)).toBe(true);
      expect(matcher.matches(30)).toBe(true);
      expect(matcher.matches(59)).toBe(true);
    });

    it('matches exact numbers and lists', () => {
      const matcher = parseCronField('1,5,10', 0, 59);
      expect(matcher.matches(1)).toBe(true);
      expect(matcher.matches(5)).toBe(true);
      expect(matcher.matches(10)).toBe(true);
      expect(matcher.matches(2)).toBe(false);
    });

    it('matches ranges', () => {
      const matcher = parseCronField('1-5', 0, 7);
      expect(matcher.matches(1)).toBe(true);
      expect(matcher.matches(3)).toBe(true);
      expect(matcher.matches(5)).toBe(true);
      expect(matcher.matches(6)).toBe(false);
      expect(matcher.matches(0)).toBe(false);
    });

    it('matches step intervals like */15', () => {
      const matcher = parseCronField('*/15', 0, 59);
      expect(matcher.matches(0)).toBe(true);
      expect(matcher.matches(15)).toBe(true);
      expect(matcher.matches(30)).toBe(true);
      expect(matcher.matches(45)).toBe(true);
      expect(matcher.matches(10)).toBe(false);
    });

    it('validates 5-part cron syntax and rejects invalid lengths', () => {
      expect(() => parseCronExpression('0 8 * *')).toThrow(/must have exactly 5 parts/);
      expect(() => parseCronExpression('0 8 * * * *')).toThrow(/must have exactly 5 parts/);
    });

    it('accurately calculates next run for Daily 8:00 AM (0 8 * * *)', () => {
      // Reference date: 2026-09-24 at 07:00:00
      const ref = new Date('2026-09-24T07:00:00.000Z');
      const next = calculateNextRun('0 8 * * *', ref);
      expect(next.getUTCHours()).toBe(8);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getUTCDate()).toBe(24);
    });

    it('advances to next day if time has already passed today', () => {
      // Reference date: 2026-09-24 at 09:30:00
      const ref = new Date('2026-09-24T09:30:00.000Z');
      const next = calculateNextRun('0 8 * * *', ref);
      expect(next.getUTCHours()).toBe(8);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getUTCDate()).toBe(25);
    });

    it('accurately calculates next run for Hourly (0 * * * *)', () => {
      const ref = new Date('2026-09-24T14:25:00.000Z');
      const next = calculateNextRun('0 * * * *', ref);
      expect(next.getUTCHours()).toBe(15);
      expect(next.getUTCMinutes()).toBe(0);
    });

    it('accurately calculates next run for Weekly on Monday at 9:00 AM (0 9 * * 1)', () => {
      // 2026-09-24 is a Thursday. Next Monday is 2026-09-28.
      const ref = new Date('2026-09-24T10:00:00.000Z');
      const next = calculateNextRun('0 9 * * 1', ref);
      expect(next.getUTCDay()).toBe(1); // Monday
      expect(next.getUTCHours()).toBe(9);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getUTCDate()).toBe(28);
    });
  });

  describe('In-Chat Natural Language Trigger Parser', () => {
    it('parses: "Every morning at 8am summarize unread emails and top reels"', () => {
      const result = parseNaturalLanguageTrigger(
        'Every morning at 8am summarize unread emails and top reels',
      );

      expect(result.cronExpression).toBe('0 8 * * *');
      expect(result.humanReadable).toContain('Daily at 08:00');
      expect(result.actionPrompt).toContain('summarize unread emails and top reels');
      expect(result.detectedApps).toContain('quantmail');
      expect(result.detectedApps).toContain('quantneon');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('parses: "Hourly GitHub PR triage"', () => {
      const result = parseNaturalLanguageTrigger('Hourly GitHub PR triage');

      expect(result.cronExpression).toBe('0 * * * *');
      expect(result.humanReadable).toContain('Every hour');
      expect(result.actionPrompt).toContain('GitHub PR triage');
      expect(result.suggestedName).toBe('Hourly GitHub PR Triage');
      expect(result.detectedApps).toContain('quantgit');
    });

    it('parses: "Weekly Competitor Scan on Monday at 9am"', () => {
      const result = parseNaturalLanguageTrigger('Weekly on Monday at 9am run competitor scan');

      expect(result.cronExpression).toBe('0 9 * * 1');
      expect(result.humanReadable).toContain('Weekly on Monday at 09:00');
      expect(result.actionPrompt).toContain('run competitor scan');
      expect(result.detectedApps).toContain('quantai');
    });

    it('parses: "Every weekday at 8:30 AM send morning status"', () => {
      const result = parseNaturalLanguageTrigger('Every weekday at 8:30 am send morning status');

      expect(result.cronExpression).toBe('30 8 * * 1-5');
      expect(result.humanReadable).toContain('Every weekday at 08:30');
      expect(result.actionPrompt).toContain('send morning status');
    });

    it('parses: "Every 15 minutes monitor server health"', () => {
      const result = parseNaturalLanguageTrigger('Every 15 minutes monitor server health');

      expect(result.cronExpression).toBe('*/15 * * * *');
      expect(result.humanReadable).toBe('Every 15 minutes');
      expect(result.actionPrompt).toContain('monitor server health');
    });
  });

  describe('ScheduledTasksService — Task Lifecycle', () => {
    let service: ScheduledTasksService;

    beforeEach(() => {
      service = new ScheduledTasksService();
    });

    it('creates a scheduled task with explicit cron', async () => {
      const task = await service.createScheduledTask({
        userId: 'user-orchestrator',
        name: 'Daily 8:00 AM Daily Briefing',
        cronExpression: '0 8 * * *',
        actionPrompt: 'Summarize priority inbox and unread notifications',
        targetApp: 'quantmail',
      });

      expect(task.id).toMatch(/^task-/);
      expect(task.name).toBe('Daily 8:00 AM Daily Briefing');
      expect(task.status).toBe('ACTIVE');
      expect(task.cronExpression).toBe('0 8 * * *');
      expect(task.nextRunAt).toBeDefined();
      expect(task.runCount).toBe(0);

      const retrieved = service.getScheduledTask(task.id, 'user-orchestrator');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Daily 8:00 AM Daily Briefing');
    });

    it('creates a scheduled task from natural language trigger', async () => {
      const task = await service.createScheduledTask({
        userId: 'user-orchestrator',
        nlPrompt: 'Every morning at 8am summarize unread emails and top reels',
      });

      expect(task.cronExpression).toBe('0 8 * * *');
      expect(task.nlTrigger).toBe('Every morning at 8am summarize unread emails and top reels');
      expect(task.targetApps).toContain('quantmail');
      expect(task.targetApps).toContain('quantneon');
      expect(task.status).toBe('ACTIVE');
    });

    it('lists tasks with user isolation and status filters', async () => {
      await service.createScheduledTask({
        userId: 'user-alice',
        name: 'Task 1',
        cronExpression: '0 8 * * *',
        actionPrompt: 'Daily brief',
      });

      await service.createScheduledTask({
        userId: 'user-alice',
        name: 'Task 2',
        cronExpression: '0 * * * *',
        actionPrompt: 'Hourly check',
      });

      await service.createScheduledTask({
        userId: 'user-bob',
        name: 'Bob Task',
        cronExpression: '0 9 * * 1',
        actionPrompt: 'Weekly review',
      });

      const aliceTasks = service.listScheduledTasks('user-alice');
      expect(aliceTasks).toHaveLength(2);

      const bobTasks = service.listScheduledTasks('user-bob');
      expect(bobTasks).toHaveLength(1);
      expect(bobTasks[0]?.name).toBe('Bob Task');
    });

    it('updates task cron expression and recalculates nextRunAt', async () => {
      const task = await service.createScheduledTask({
        userId: 'user-test',
        name: 'Scan',
        cronExpression: '0 8 * * *',
        actionPrompt: 'Initial prompt',
      });

      const originalNextRun = task.nextRunAt;

      const updated = service.updateScheduledTask(task.id, 'user-test', {
        name: 'Updated Scan',
        cronExpression: '0 12 * * *',
      });

      expect(updated.name).toBe('Updated Scan');
      expect(updated.cronExpression).toBe('0 12 * * *');
      expect(updated.nextRunAt).not.toBe(originalNextRun);
    });

    it('pauses, resumes, and cancels a task', async () => {
      const task = await service.createScheduledTask({
        userId: 'user-lifecycle',
        name: 'Lifecycle Task',
        cronExpression: '0 * * * *',
        actionPrompt: 'Run hourly',
      });

      const paused = service.pauseScheduledTask(task.id, 'user-lifecycle');
      expect(paused.status).toBe('PAUSED');

      const resumed = service.resumeScheduledTask(task.id, 'user-lifecycle');
      expect(resumed.status).toBe('ACTIVE');

      const cancelled = service.cancelScheduledTask(task.id, 'user-lifecycle');
      expect(cancelled).toBe(true);

      const retrieved = service.getScheduledTask(task.id, 'user-lifecycle');
      expect(retrieved?.status).toBe('CANCELLED');

      // Attempting to trigger a cancelled task throws
      await expect(service.triggerTask(task.id, 'user-lifecycle')).rejects.toThrow(
        /Cannot execute cancelled task/,
      );
    });

    it('deletes a scheduled task completely', async () => {
      const task = await service.createScheduledTask({
        userId: 'user-delete',
        name: 'To Delete',
        cronExpression: '0 0 * * *',
        actionPrompt: 'Clean temp files',
      });

      const deleted = service.deleteScheduledTask(task.id, 'user-delete');
      expect(deleted).toBe(true);
      expect(service.getScheduledTask(task.id, 'user-delete')).toBeNull();
    });
  });

  describe('Execution Ledger & Artifact Links', () => {
    let service: ScheduledTasksService;

    beforeEach(() => {
      service = new ScheduledTasksService();
    });

    it('manually triggers task, generates authentic Quant artifacts, and updates ledger', async () => {
      const task = await service.createScheduledTask({
        userId: 'user-exec',
        name: 'Daily 8:00 AM Daily Briefing',
        cronExpression: '0 8 * * *',
        actionPrompt: 'Summarize priority inbox and unread notifications',
        targetApp: 'quantmail',
      });

      const run = await service.triggerTask(task.id, 'user-exec', 'MANUAL');

      expect(run.id).toMatch(/^run-/);
      expect(run.status).toBe('SUCCESS');
      expect(run.triggerSource).toBe('MANUAL');
      expect(run.durationMs).toBeGreaterThanOrEqual(0);
      expect(run.outputArtifacts.length).toBeGreaterThan(0);

      // Verify email draft artifact link
      const emailArtifact = run.outputArtifacts.find((a) => a.type === 'email_draft');
      expect(emailArtifact).toBeDefined();
      expect(emailArtifact?.uri).toMatch(/^quantmail:\/\/drafts\//);

      // Check task ledger state updates
      const updatedTask = service.getScheduledTask(task.id, 'user-exec');
      expect(updatedTask?.runCount).toBe(1);
      expect(updatedTask?.lastRunStatus).toBe('SUCCESS');
      expect(updatedTask?.lastRunAt).toBe(run.completedAt);

      // Check execution history retrieval
      const history = service.getExecutionHistory(task.id, 'user-exec');
      expect(history).toHaveLength(1);
      expect(history[0]?.id).toBe(run.id);

      const singleRun = service.getExecutionRun(task.id, run.id, 'user-exec');
      expect(singleRun).not.toBeNull();
      expect(singleRun?.id).toBe(run.id);
    });

    it('generates GitHub PR triage artifact for PR tasks', async () => {
      const task = await service.createScheduledTask({
        userId: 'user-exec',
        name: 'Hourly GitHub PR triage',
        cronExpression: '0 * * * *',
        actionPrompt: 'Triage open github PRs and check CI health',
        targetApp: 'quantgit',
      });

      const run = await service.triggerTask(task.id, 'user-exec');
      expect(run.status).toBe('SUCCESS');

      const prArtifact = run.outputArtifacts.find((a) => a.type === 'github_pr');
      expect(prArtifact).toBeDefined();
      expect(prArtifact?.uri).toMatch(/^quantgit:\/\/prs\/triage-/);
      expect(prArtifact?.metadata?.['triagedCount']).toBe(7);
    });

    it('generates competitor scan artifact for market intelligence tasks', async () => {
      const task = await service.createScheduledTask({
        userId: 'user-exec',
        name: 'Weekly Competitor Scan',
        cronExpression: '0 9 * * 1',
        actionPrompt: 'Weekly Competitor Scan and price monitoring',
        targetApp: 'quantai',
      });

      const run = await service.triggerTask(task.id, 'user-exec');
      expect(run.status).toBe('SUCCESS');

      const reportArtifact = run.outputArtifacts.find((a) => a.type === 'report');
      expect(reportArtifact).toBeDefined();
      expect(reportArtifact?.uri).toMatch(/^quantdrive:\/\/reports\/competitor-scan-/);
    });

    it('records failed run status, logs, and error message in ledger upon executor error', async () => {
      const faultyExecutor = vi
        .fn()
        .mockRejectedValue(new Error('Network timeout contacting agent model'));
      const customService = new ScheduledTasksService({ executor: faultyExecutor });

      const task = await customService.createScheduledTask({
        userId: 'user-fault',
        name: 'Faulty Task',
        cronExpression: '0 * * * *',
        actionPrompt: 'This will fail',
      });

      const run = await customService.triggerTask(task.id, 'user-fault');

      expect(run.status).toBe('FAILED');
      expect(run.error).toContain('Network timeout contacting agent model');
      expect(run.logs.some((l) => l.includes('Task run failed'))).toBe(true);

      const taskAfter = customService.getScheduledTask(task.id, 'user-fault');
      expect(taskAfter?.lastRunStatus).toBe('FAILED');
      expect(taskAfter?.runCount).toBe(1);
    });
  });
});
