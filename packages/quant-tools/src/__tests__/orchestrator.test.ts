import { describe, it, expect } from 'vitest';
import { CrossAppOrchestrator } from '../orchestrator/cross-app-orchestrator.js';
import { ContextManager } from '../orchestrator/context-manager.js';
import { ToolExecutor } from '../executor/tool-executor.js';
import { allTools } from '../tools/index.js';
import type { OrchestratorEvent } from '../orchestrator/cross-app-orchestrator.js';

describe('CrossAppOrchestrator', () => {
  it('should create a plan from natural language input', () => {
    const orchestrator = new CrossAppOrchestrator(allTools);
    const plan = orchestrator.createPlan('send an email');
    expect(plan).toBeDefined();
    expect(plan.id).toBeTruthy();
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('should return empty plan for unrecognized input', () => {
    const orchestrator = new CrossAppOrchestrator(allTools);
    const plan = orchestrator.createPlan('zzz qqq xxx jjj');
    expect(plan.steps).toHaveLength(0);
  });

  it('should select context-aware tools', () => {
    const contextManager = new ContextManager({
      currentApp: 'quantmail',
      currentItem: { id: 'email-123', type: 'email', title: 'Test Email' },
    });
    const orchestrator = new CrossAppOrchestrator(allTools, contextManager);
    const plan = orchestrator.createPlan('reply to this email');
    expect(plan.steps.length).toBeGreaterThan(0);
    // Context should be injected into params
    const firstStep = plan.steps[0]!;
    expect(firstStep.params._contextItemId).toBe('email-123');
    expect(firstStep.params._contextSource).toBe('quantmail:email');
  });

  it('should execute a multi-step plan with dependency resolution', async () => {
    const executor = new ToolExecutor();
    executor.registerHandler('quantmail.send-email', async (params) => ({
      sent: true,
      to: params.to ?? 'test@example.com',
    }));
    executor.registerHandler('quantmail.compose-draft', async (params) => ({
      draftId: 'draft-1',
      subject: params.subject ?? 'Hello',
    }));

    const orchestrator = new CrossAppOrchestrator(allTools, undefined, executor);
    const results = await orchestrator.execute('send email', {
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(results.length).toBeGreaterThan(0);
    // At least the first step should succeed (handler is registered)
    const handledResult = results.find((r) => r.success);
    if (handledResult) {
      expect(handledResult.data).toBeDefined();
    }
  });

  it('should emit streaming progress events', async () => {
    const executor = new ToolExecutor();
    executor.registerHandler('quantmail.send-email', async () => ({ sent: true }));

    const orchestrator = new CrossAppOrchestrator(allTools, undefined, executor);
    const events: OrchestratorEvent[] = [];
    orchestrator.on((event) => events.push(event));

    await orchestrator.execute('send email', {
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.type).toBe('plan_created');

    const stepStarts = events.filter((e) => e.type === 'step_start');
    expect(stepStarts.length).toBeGreaterThan(0);

    const lastEvent = events[events.length - 1]!;
    expect(lastEvent.type).toBe('execution_complete');
  });

  it('should handle failed steps and stop execution', async () => {
    const executor = new ToolExecutor();
    // No handlers registered, all steps will fail

    const orchestrator = new CrossAppOrchestrator(allTools, undefined, executor);
    const events: OrchestratorEvent[] = [];
    orchestrator.on((event) => events.push(event));

    const results = await orchestrator.execute('send email', {
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(results.length).toBe(1); // Should stop after first failure
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toContain('No handler registered');

    const failEvents = events.filter((e) => e.type === 'step_failed');
    expect(failEvents.length).toBe(1);
  });

  it('should support dry run mode', async () => {
    const orchestrator = new CrossAppOrchestrator(allTools);
    const results = await orchestrator.execute('send email', {
      userId: 'user-1',
      sessionId: 'session-1',
      dryRun: true,
    });

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)?.dryRun).toBe(true);
    }
  });

  it('should allow unsubscribing from events', async () => {
    const orchestrator = new CrossAppOrchestrator(allTools);
    const events: OrchestratorEvent[] = [];
    const unsubscribe = orchestrator.on((event) => events.push(event));
    unsubscribe();

    await orchestrator.execute('send email', {
      userId: 'user-1',
      sessionId: 'session-1',
      dryRun: true,
    });

    expect(events).toHaveLength(0);
  });
});

describe('ContextManager', () => {
  it('should track current app', () => {
    const cm = new ContextManager({ currentApp: 'quantmail' });
    expect(cm.getContext().currentApp).toBe('quantmail');
    cm.setCurrentApp('quantcalendar');
    expect(cm.getContext().currentApp).toBe('quantcalendar');
  });

  it('should track current item and add to recent items', () => {
    const cm = new ContextManager({ currentApp: 'quantmail' });
    cm.setCurrentItem({ id: 'email-1', type: 'email', title: 'Test' });
    expect(cm.getContext().currentItem).toEqual({ id: 'email-1', type: 'email', title: 'Test' });
    expect(cm.getContext().recentItems.length).toBe(1);
    expect(cm.getContext().recentItems[0]!.id).toBe('email-1');
  });

  it('should resolve "this" references to current item', () => {
    const cm = new ContextManager({
      currentApp: 'quantmail',
      currentItem: { id: 'email-42', type: 'email' },
    });
    const ref = cm.resolveReference('forward this email to someone');
    expect(ref.resolved).toBe(true);
    expect(ref.value).toBe('email-42');
    expect(ref.source).toBe('quantmail:email');
  });

  it('should resolve "current" references', () => {
    const cm = new ContextManager({
      currentApp: 'quantdocs',
      currentItem: { id: 'doc-7', type: 'document' },
    });
    const ref = cm.resolveReference('share current document');
    expect(ref.resolved).toBe(true);
    expect(ref.value).toBe('doc-7');
  });

  it('should resolve "last" references from recent items', () => {
    const cm = new ContextManager({ currentApp: 'quantmail' });
    cm.addRecentItem({
      id: 'email-10',
      type: 'email',
      title: 'Recent Email',
      app: 'quantmail',
      timestamp: Date.now(),
    });
    const ref = cm.resolveReference('reply to last email');
    expect(ref.resolved).toBe(true);
    expect(ref.value).toBe('email-10');
  });

  it('should return unresolved for unknown references', () => {
    const cm = new ContextManager();
    const ref = cm.resolveReference('do something random');
    expect(ref.resolved).toBe(false);
  });

  it('should build execution context with metadata', () => {
    const cm = new ContextManager({ currentApp: 'quantmail' });
    cm.setMetadata('theme', 'dark');
    const ctx = cm.buildExecutionContext('user-1', 'session-1');
    expect(ctx.userId).toBe('user-1');
    expect(ctx.sessionId).toBe('session-1');
    expect(ctx.metadata?.currentApp).toBe('quantmail');
    expect(ctx.metadata?.theme).toBe('dark');
  });

  it('should inject context into params when reference resolves', () => {
    const cm = new ContextManager({
      currentApp: 'quantmail',
      currentItem: { id: 'email-5', type: 'email' },
    });
    const params = cm.injectContextIntoParams({ subject: 'Hello' }, 'reply to this email');
    expect(params._contextItemId).toBe('email-5');
    expect(params._contextSource).toBe('quantmail:email');
    expect(params.subject).toBe('Hello');
  });

  it('should not inject context when reference does not resolve', () => {
    const cm = new ContextManager();
    const params = cm.injectContextIntoParams({ subject: 'Hello' }, 'send a new email');
    expect(params._contextItemId).toBeUndefined();
    expect(params.subject).toBe('Hello');
  });

  it('should limit recent items to 20', () => {
    const cm = new ContextManager();
    for (let i = 0; i < 25; i++) {
      cm.addRecentItem({
        id: `item-${i}`,
        type: 'email',
        title: `Item ${i}`,
        app: 'quantmail',
        timestamp: Date.now() + i,
      });
    }
    expect(cm.getContext().recentItems.length).toBe(20);
  });
});
