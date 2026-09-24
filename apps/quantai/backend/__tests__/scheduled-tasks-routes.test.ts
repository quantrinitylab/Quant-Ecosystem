// ============================================================================
// QuantAI — Scheduled Tasks Fastify Routes Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import scheduledTasksRoutes from '../routes/scheduled-tasks';
import { ScheduledTasksService } from '../services/scheduled-tasks.service';

vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

describe('Fastify Routes: /agents/scheduled', () => {
  let app: ReturnType<typeof Fastify>;
  let scheduledTasksService: ScheduledTasksService;
  let testUserId: string | null = 'user-test-orchestrator';

  beforeEach(async () => {
    app = Fastify();
    scheduledTasksService = new ScheduledTasksService();

    app.decorate('scheduledTasksService', scheduledTasksService);
    app.decorateRequest('auth', null);

    app.addHook('preHandler', async (request: FastifyRequest) => {
      if (testUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: testUserId };
      }
    });

    await app.register(scheduledTasksRoutes, { prefix: '/agents/scheduled' });
    await app.ready();
  });

  afterEach(async () => {
    testUserId = 'user-test-orchestrator';
    await app.close();
  });

  it('POST /agents/scheduled/parse — parses natural language trigger prompt', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/scheduled/parse',
      payload: {
        nlPrompt: 'Every morning at 8am summarize unread emails and top reels',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.cronExpression).toBe('0 8 * * *');
    expect(body.data.detectedApps).toContain('quantmail');
    expect(body.data.detectedApps).toContain('quantneon');
  });

  it('POST /agents/scheduled — creates recurring agent task with cron expression', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/scheduled',
      payload: {
        name: 'Daily 8:00 AM Daily Briefing',
        cronExpression: '0 8 * * *',
        actionPrompt: 'Summarize executive inbox and highlight urgent notifications',
        targetApp: 'quantmail',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toMatch(/^task-/);
    expect(body.data.cronExpression).toBe('0 8 * * *');
    expect(body.data.status).toBe('ACTIVE');
  });

  it('POST /agents/scheduled — creates task via natural language prompt', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/scheduled',
      payload: {
        nlPrompt: 'Hourly GitHub PR triage',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.cronExpression).toBe('0 * * * *');
    expect(body.data.targetApps).toContain('quantgit');
  });

  it('GET /agents/scheduled — lists tasks for authenticated user', async () => {
    // Create two tasks
    await scheduledTasksService.createScheduledTask({
      userId: 'user-test-orchestrator',
      name: 'Task Alpha',
      cronExpression: '0 8 * * *',
      actionPrompt: 'Alpha prompt',
    });
    await scheduledTasksService.createScheduledTask({
      userId: 'user-test-orchestrator',
      name: 'Task Beta',
      cronExpression: '0 * * * *',
      actionPrompt: 'Beta prompt',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/agents/scheduled',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /agents/scheduled/:id — returns task details and next run', async () => {
    const task = await scheduledTasksService.createScheduledTask({
      userId: 'user-test-orchestrator',
      name: 'Scan Task',
      cronExpression: '0 9 * * 1',
      actionPrompt: 'Weekly scan',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/agents/scheduled/${task.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(task.id);
    expect(body.data.nextRunAt).toBeDefined();
  });

  it('PATCH /agents/scheduled/:id — updates task parameters and recalculates schedule', async () => {
    const task = await scheduledTasksService.createScheduledTask({
      userId: 'user-test-orchestrator',
      name: 'Old Name',
      cronExpression: '0 8 * * *',
      actionPrompt: 'Old prompt',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/agents/scheduled/${task.id}`,
      payload: {
        name: 'New Name',
        cronExpression: '0 12 * * *',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.name).toBe('New Name');
    expect(body.data.cronExpression).toBe('0 12 * * *');
  });

  it('POST /agents/scheduled/:id/trigger — executes task and returns run with output artifacts', async () => {
    const task = await scheduledTasksService.createScheduledTask({
      userId: 'user-test-orchestrator',
      name: 'Email & Reels Briefing',
      cronExpression: '0 8 * * *',
      actionPrompt: 'Every morning at 8am summarize unread emails and top reels',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/agents/scheduled/${task.id}/trigger`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('SUCCESS');
    expect(body.data.outputArtifacts.length).toBeGreaterThan(0);
    expect(body.data.outputArtifacts[0].uri).toBeDefined();
  });

  it('GET /agents/scheduled/:id/runs — retrieves execution ledger history', async () => {
    const task = await scheduledTasksService.createScheduledTask({
      userId: 'user-test-orchestrator',
      name: 'PR Triage',
      cronExpression: '0 * * * *',
      actionPrompt: 'Hourly GitHub PR triage',
    });

    await scheduledTasksService.triggerTask(task.id, 'user-test-orchestrator');

    const response = await app.inject({
      method: 'GET',
      url: `/agents/scheduled/${task.id}/runs`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe('SUCCESS');
  });

  it('DELETE /agents/scheduled/:id — removes the task', async () => {
    const task = await scheduledTasksService.createScheduledTask({
      userId: 'user-test-orchestrator',
      name: 'To Cancel',
      cronExpression: '0 0 * * *',
      actionPrompt: 'Daily cleanup',
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/agents/scheduled/${task.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(scheduledTasksService.getScheduledTask(task.id)).toBeNull();
  });

  it('rejects unauthenticated requests with 401', async () => {
    testUserId = null; // simulate unauthenticated

    const response = await app.inject({
      method: 'GET',
      url: '/agents/scheduled',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for unknown task ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/agents/scheduled/task-non-existent',
    });

    expect(response.statusCode).toBe(404);
  });
});
