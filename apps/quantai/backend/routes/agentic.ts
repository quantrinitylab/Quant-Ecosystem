import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { orchestrator, WorkflowEngine } from '@quant/agentic';
import { getAgentGateway } from '../services/agent-gateway.service';
import { APP_ENDPOINTS, checkAppHealth } from '../services/app-endpoints';

const workflowSchema = z.object({
  name: z.string(),
  goal: z.string(),
});

const runAgentSchema = z.object({
  agentId: z.string(),
  input: z.string(),
  context: z.record(z.unknown()).optional(),
});

const agenticChatSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionId: z.string().max(128).optional(),
  stream: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(false),
});

const confirmSchema = z.object({
  approved: z.boolean(),
  editedParams: z.record(z.unknown()).optional(),
});

export default async function agenticRoutes(fastify: FastifyInstance) {
  const workflowEngine = new WorkflowEngine(orchestrator);

  // Run a specific agent
  fastify.post('/agents/run', async (request, reply) => {
    const parseResult = runAgentSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { agentId, input, context } = parseResult.data;

    try {
      const result = await orchestrator.runAgent(agentId, input, {
        ...context,
        userId,
      });

      return reply.send({ success: true, result });
    } catch (error: any) {
      throw createAppError(error.message, 500, 'AGENT_ERROR');
    }
  });

  // Create and execute a workflow
  fastify.post('/workflows', async (request, reply) => {
    const parseResult = workflowSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { name, goal } = parseResult.data;

    try {
      const workflow = await workflowEngine.createWorkflow(userId, name, goal);
      const results = await workflowEngine.executeWorkflow(workflow.id);

      return reply.send({
        success: true,
        workflow,
        results,
      });
    } catch (error: any) {
      throw createAppError(error.message, 500, 'WORKFLOW_ERROR');
    }
  });

  // Get user's workflows
  fastify.get('/workflows', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const workflows = workflowEngine.getUserWorkflows(userId);
    return reply.send(workflows);
  });

  // ------------------------------------------------------------------
  // Agent Gateway (Phase 2): cross-app tool execution over HTTP
  // ------------------------------------------------------------------

  function getUserJwt(request: unknown): string {
    const header = (request as { headers?: Record<string, unknown> }).headers?.['authorization'];
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    throw createAppError('Missing bearer token', 401, 'UNAUTHORIZED');
  }

  function requireUserId(request: unknown): string {
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    return userId;
  }

  /**
   * POST /agentic/chat — natural language -> planned tool calls -> executed
   * against the target app backends. Streams SSE events:
   *   {type:'plan', steps} | {type:'tool_start', toolId} |
   *   {type:'tool_result', toolId, success} |
   *   {type:'confirmation_required', planId, steps, reason} |
   *   {type:'text', delta} | {type:'done'} | {type:'error', message}
   *
   * Tier-2+ steps are NOT executed; the client must render a Sentinel
   * approval card and call POST /agentic/confirm/:planId.
   */
  fastify.post('/chat', async (request, reply) => {
    const userId = requireUserId(request);
    const jwt = getUserJwt(request);
    const parsed = agenticChatSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const { message, sessionId, stream, dryRun } = parsed.data;

    const requestId =
      (request.headers['x-request-id'] as string | undefined) ??
      `agentic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const gateway = getAgentGateway();
    const plan = gateway.plan(message);

    const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

    if (!stream) {
      // Non-streaming JSON mode (simpler clients)
      const gate = gateway.checkPermissions(plan);
      if (gate.held) {
        gateway.bindHeldPlan(gate.planId, userId);
        return reply
          .status(202)
          .send({ success: true, status: 'confirmation_required', planId: gate.planId, reason: gate.reason, steps: gate.steps });
      }
      const results = await gateway.execute(plan, { userId, jwt, requestId, sessionId, dryRun });
      return reply.send({ success: true, data: { planId: plan.id, results } });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'x-request-id': requestId,
    });

    const send = (obj: unknown) => {
      reply.raw.write(sse(obj));
    };

    try {
      send({
        type: 'plan',
        planId: plan.id,
        description: plan.description,
        steps: plan.steps.map((s) => ({ stepId: s.stepId, toolId: s.toolId, params: s.params })),
      });

      const gate = gateway.checkPermissions(plan);
      if (gate.held) {
        gateway.bindHeldPlan(gate.planId, userId);
        send({
          type: 'confirmation_required',
          planId: gate.planId,
          reason: gate.reason,
          steps: gate.steps,
        });
        send({ type: 'done' });
        reply.raw.end();
        return;
      }

      // Execute step-by-step so the client sees live progress.
      const executor = gateway.getExecutor();
      for (const step of plan.steps) {
        send({ type: 'tool_start', stepId: step.stepId, toolId: step.toolId });
        const [result] = await executor.execute(
          { ...plan, steps: [step] },
          {
            userId,
            sessionId: sessionId ?? `sess-${Date.now()}`,
            permissions: 1,
            dryRun: dryRun ?? false,
            metadata: { jwt, requestId },
          },
        );
        send({
          type: 'tool_result',
          stepId: step.stepId,
          toolId: step.toolId,
          success: result?.success ?? false,
          error: result?.error,
          // Summaries only over SSE; full payloads via the JSON mode.
          data: result?.success ? { ok: true } : undefined,
        });
        if (!result?.success) {
          send({ type: 'error', message: result?.error ?? 'Tool execution failed' });
          break;
        }
      }

      send({ type: 'done' });
      reply.raw.end();
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      reply.raw.end();
    }
  });

  /**
   * POST /agentic/confirm/:planId — Sentinel approval resume.
   * Body: { approved: boolean }. Returns the execution results (or [] when denied).
   */
  fastify.post<{ Params: { planId: string } }>('/confirm/:planId', async (request, reply) => {
    const userId = requireUserId(request);
    const jwt = getUserJwt(request);
    const parsed = confirmSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const requestId =
      (request.headers['x-request-id'] as string | undefined) ?? `agentic-confirm-${Date.now()}`;
    const gateway = getAgentGateway();
    const results = await gateway.confirm(request.params.planId, {
      userId,
      jwt,
      requestId,
      approved: parsed.data.approved,
    });
    return reply.send({ success: true, data: { results, approved: parsed.data.approved } });
  });

  /**
   * GET /agentic/apps/health — per-app reachability for the gateway.
   * Powers the "app status dots" UI and graceful degradation.
   */
  fastify.get('/apps/health', async (request, reply) => {
    requireUserId(request);
    const apps = await Promise.all(APP_ENDPOINTS.map((e) => checkAppHealth(e.appId)));
    return reply.send({ success: true, data: { apps } });
  });
}
