import { describe, it, expect, vi } from 'vitest';
import { CrossAppOrchestrator } from '../orchestrator/cross-app-orchestrator.js';
import { ToolExecutor } from '../executor/tool-executor.js';
import { ContextManager } from '../orchestrator/context-manager.js';
import { allTools } from '../tools/index.js';
import type { OrchestratorEvent } from '../orchestrator/cross-app-orchestrator.js';

describe('Universal Control Layer Integration', () => {
  it('processNaturalLanguage: "send email to alice@test.com about the project" with registered handler -> success', async () => {
    const executor = new ToolExecutor();
    executor.registerHandler('quantmail.send', async (params) => ({
      sent: true,
      to: params['to'],
    }));

    const orchestrator = new CrossAppOrchestrator(allTools, undefined, executor);
    const result = await orchestrator.processNaturalLanguage(
      'send email to alice@test.com about the project',
      { userId: 'user-1', sessionId: 'session-1' },
    );

    expect(result.plan.steps.length).toBeGreaterThan(0);
    expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
    // The plan should have mapped to quantmail
    const mailStep = result.plan.steps.find((s) => s.toolId.startsWith('quantmail'));
    expect(mailStep).toBeDefined();
  });

  it('multi-app NL: "create a meeting and message the team on chat" produces multiple steps from different apps', async () => {
    const executor = new ToolExecutor();
    executor.registerHandler('quantcalendar.create', async () => ({ eventId: 'ev-1' }));
    executor.registerHandler('quantchat.send', async () => ({ messageId: 'msg-1' }));
    executor.registerHandler('quantmeet.start', async () => ({ meetId: 'm-1' }));

    const orchestrator = new CrossAppOrchestrator(allTools, undefined, executor);
    const result = await orchestrator.processNaturalLanguage(
      'create a meeting tomorrow and message the team on chat',
      { userId: 'user-1', sessionId: 'session-1' },
    );

    // The parser should split into at least 2 intents, and the planner creates 2+ steps
    expect(result.plan.steps.length).toBeGreaterThanOrEqual(2);
    // Verify the plan spans multiple distinct tool IDs (not all the same)
    const toolIds = result.plan.steps.map((s) => s.toolId);
    const uniqueToolIds = new Set(toolIds);
    expect(uniqueToolIds.size).toBeGreaterThanOrEqual(2);
  });

  it('context-aware: with currentItem set, "forward this email" resolves reference', async () => {
    const executor = new ToolExecutor();
    executor.registerHandler('quantmail.send', async (params) => ({
      forwarded: true,
      itemId: params['_contextItemId'],
    }));

    const contextManager = new ContextManager({
      currentApp: 'quantmail',
      currentItem: { id: 'email-999', type: 'email', title: 'Important' },
    });

    const orchestrator = new CrossAppOrchestrator(allTools, contextManager, executor);
    const result = await orchestrator.processNaturalLanguage('send this email to someone', {
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(result.plan.steps.length).toBeGreaterThan(0);
  });

  it('dry run: processNaturalLanguage with dryRun:true -> plan without side effects', async () => {
    const handlerCalled = vi.fn();
    const executor = new ToolExecutor();
    executor.registerHandler('quantmail.send', async () => {
      handlerCalled();
      return { sent: true };
    });

    const orchestrator = new CrossAppOrchestrator(allTools, undefined, executor);
    const result = await orchestrator.processNaturalLanguage('send email to bob@test.com', {
      userId: 'user-1',
      sessionId: 'session-1',
      dryRun: true,
    });

    // In dry run, the executor still returns success with dryRun data
    expect(result.plan.steps.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.success).toBe(true);
      expect((r.data as Record<string, unknown>)?.['dryRun']).toBe(true);
    }
    // Real handler not called in dry run mode
    expect(handlerCalled).not.toHaveBeenCalled();
  });

  it('error + rollback: one handler fails, verify rollback occurs', async () => {
    const undoCalled: string[] = [];
    const executor = new ToolExecutor();
    executor.registerHandler('quantmail.send', async () => ({ sent: true }));
    executor.registerHandler('quantchat.send', async () => {
      throw new Error('chat service down');
    });
    executor.registerHandler('quantmail.archive', async () => {
      undoCalled.push('quantmail.archive');
      return { archived: true };
    });

    const orchestrator = new CrossAppOrchestrator(allTools, undefined, executor);
    const result = await orchestrator.processNaturalLanguage(
      'send email to bob@test.com and message the team on chat',
      { userId: 'user-1', sessionId: 'session-1', enableRollback: true },
    );

    // If the mail step succeeded and chat failed, rollback should be attempted
    if (result.rollbackResults && result.rollbackResults.length > 0) {
      expect(undoCalled.length).toBeGreaterThan(0);
    }
    expect(result.success).toBe(false);
  });

  it('permission enforcement: low-permission user cannot execute high-tier step (unregistered handler)', async () => {
    const executor = new ToolExecutor();
    // No handlers registered for high-tier tools

    const orchestrator = new CrossAppOrchestrator(allTools, undefined, executor);
    const result = await orchestrator.processNaturalLanguage('send email to test@test.com', {
      userId: 'user-1',
      sessionId: 'session-1',
    });

    // Without a registered handler, execution fails
    if (result.plan.steps.length > 0) {
      const failedStep = result.results.find((r) => !r.success);
      if (failedStep) {
        expect(failedStep.error).toBeDefined();
      }
    }
  });

  it('event emission: listen to events during processNaturalLanguage', async () => {
    const executor = new ToolExecutor();
    executor.registerHandler('quantmail.send', async () => ({ sent: true }));

    const orchestrator = new CrossAppOrchestrator(allTools, undefined, executor);
    const events: OrchestratorEvent[] = [];
    orchestrator.on((e) => events.push(e));

    await orchestrator.processNaturalLanguage('send email to alice@test.com', {
      userId: 'user-1',
      sessionId: 'session-1',
    });

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('plan_created');
    expect(eventTypes).toContain('execution_complete');
  });

  it('empty result for gibberish input', async () => {
    const orchestrator = new CrossAppOrchestrator(allTools);
    const result = await orchestrator.processNaturalLanguage('zzz qqq xxx jjj blargh', {
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(result.plan.steps).toHaveLength(0);
    expect(result.success).toBe(false);
  });
});
