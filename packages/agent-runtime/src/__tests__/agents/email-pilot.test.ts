import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailPilot, EmailItem } from '../../agents/email-pilot.js';
import type { AIEnginePort } from '../../ai-engine.interface.js';
import { TypedToolRegistry } from '../../typed-tool-registry.js';
import { SpendingLimit } from '../../spending-limit.js';
import { PermissionLevel } from '../../permissions.js';
import { AgentState } from '../../state-machine.js';
import { KillSwitch } from '../../kill-switch.js';

// ============================================================================
// Mock AI Engine
// ============================================================================

function createMockAIEngine(overrides?: Partial<AIEnginePort>): AIEnginePort {
  return {
    infer: vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'email.archive', args: { emailId: '1' }, description: 'Archive email' },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'informational', confidence: 0.9 }),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    ...overrides,
  };
}

function createDeps(opts?: {
  aiEngine?: AIEnginePort;
  toolRegistry?: TypedToolRegistry;
  spendingLimit?: SpendingLimit;
}) {
  return {
    aiEngine: opts?.aiEngine ?? createMockAIEngine(),
    toolRegistry: opts?.toolRegistry ?? new TypedToolRegistry(),
    spendingLimit:
      opts?.spendingLimit ?? new SpendingLimit({ dailyCap: 10, weeklyCap: 50, monthlyCap: 200 }),
  };
}

describe('EmailPilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has correct default configuration', () => {
    const pilot = new EmailPilot(createDeps());
    expect(pilot.name).toBe('Email Pilot');
    expect(pilot.defaultPermission).toBe(PermissionLevel.ACT_LOW);
    expect(pilot.icon).toBe('mail');
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new EmailPilot(createDeps());
    // IntelligentAgent exposes getReasoningTrace
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('AI classifies spam correctly and archives', async () => {
    const classifyMock = vi
      .fn()
      .mockResolvedValueOnce({ category: 'spam', confidence: 0.98 })
      .mockResolvedValueOnce({ category: 'informational', confidence: 0.85 });
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'email.archive', args: { emailId: '1' }, description: 'Archive spam' },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });

    const aiEngine = createMockAIEngine({ classify: classifyMock, infer: inferMock });
    const pilot = new EmailPilot(createDeps({ aiEngine }));
    pilot.start();

    const emails: EmailItem[] = [
      {
        id: '1',
        from: 'spam@bad.com',
        subject: 'Win money!',
        body: 'Click here to win',
        isSpam: false,
        isRead: false,
        timestamp: Date.now(),
      },
      {
        id: '2',
        from: 'real@work.com',
        subject: 'Meeting',
        body: 'Hello, see you there.',
        isSpam: false,
        isRead: false,
        timestamp: Date.now(),
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Process inbox', params: { emails } });

    const result = pilot.getProcessingResult();
    expect(result.archived).toContain('1');
    expect(result.archived).not.toContain('2');
    // AI classify was called for each email
    expect(classifyMock).toHaveBeenCalledTimes(2);
  });

  it('AI generates reply for needs_reply emails', async () => {
    const classifyMock = vi.fn().mockResolvedValue({ category: 'needs_reply', confidence: 0.92 });
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: 'Thank you for asking. I will send the update by end of day.',
        usage: { tokens: 30, cost: 0.001 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'email.draft_reply',
            args: { emailId: '1', body: 'reply' },
            description: 'Draft reply',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ classify: classifyMock, infer: inferMock });
    const pilot = new EmailPilot(createDeps({ aiEngine }));
    pilot.start();

    const emails: EmailItem[] = [
      {
        id: '1',
        from: 'boss@work.com',
        subject: 'Status update?',
        body: 'Can you provide an update?',
        isSpam: false,
        isRead: false,
        timestamp: Date.now(),
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Process inbox', params: { emails } });

    const result = pilot.getProcessingResult();
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]!.inReplyTo).toBe('1');
    expect(result.drafts[0]!.body).toContain('Thank you for asking');
    // AI infer was called at least once for reply generation
    expect(inferMock).toHaveBeenCalled();
  });

  it('flags informational emails', async () => {
    const classifyMock = vi.fn().mockResolvedValue({ category: 'informational', confidence: 0.88 });
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'email.flag', args: { emailId: '1' }, description: 'Flag email' },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });

    const aiEngine = createMockAIEngine({ classify: classifyMock, infer: inferMock });
    const pilot = new EmailPilot(createDeps({ aiEngine }));
    pilot.start();

    const emails: EmailItem[] = [
      {
        id: '1',
        from: 'newsletter@info.com',
        subject: 'Weekly digest',
        body: 'Here is your weekly summary.',
        isSpam: false,
        isRead: false,
        timestamp: Date.now(),
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Process inbox', params: { emails } });

    const result = pilot.getProcessingResult();
    expect(result.flagged).toContain('1');
  });

  it('spending limit blocks execution when budget exhausted', async () => {
    const classifyMock = vi.fn().mockResolvedValue({ category: 'informational', confidence: 0.9 });
    // AI returns plan with email.draft_reply which is Tier1 (cost $0.01, no approval needed)
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'email.draft_reply',
          args: { emailId: '1', body: 'reply' },
          description: 'Draft reply',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });

    const aiEngine = createMockAIEngine({ classify: classifyMock, infer: inferMock });
    // Tier1 costs $0.01. Daily cap is $0.005, so canSpend(0.01) returns false.
    const tightLimit = new SpendingLimit({ dailyCap: 0.005, weeklyCap: 0.05, monthlyCap: 0.1 });

    const pilot = new EmailPilot(createDeps({ aiEngine, spendingLimit: tightLimit }));
    pilot.start();

    const emails: EmailItem[] = [
      {
        id: '1',
        from: 'test@test.com',
        subject: 'Hello',
        body: 'hi',
        isSpam: false,
        isRead: false,
        timestamp: Date.now(),
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Process inbox', params: { emails } });

    // Agent should be in FAILED state due to budget exceeded in planning loop
    expect(pilot.stateMachine.getState()).toBe(AgentState.FAILED);
  });

  it('reasoning trace is populated after execution', async () => {
    const classifyMock = vi.fn().mockResolvedValue({ category: 'spam', confidence: 0.95 });
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'email.archive', args: { emailId: '1' }, description: 'Archive' },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });

    const aiEngine = createMockAIEngine({ classify: classifyMock, infer: inferMock });
    const pilot = new EmailPilot(createDeps({ aiEngine }));
    pilot.start();

    const emails: EmailItem[] = [
      {
        id: '1',
        from: 'spam@bad.com',
        subject: 'Spam',
        body: 'junk',
        isSpam: true,
        isRead: false,
        timestamp: Date.now(),
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Process inbox', params: { emails } });

    const trace = pilot.getReasoningTrace();
    expect(trace.length).toBeGreaterThan(0);

    // Trace should include planning phases
    const phases = trace.map((t) => t.phase);
    expect(phases).toContain('observe');
    expect(phases).toContain('plan');
  });

  it('transitions to DONE on success', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'email.archive', args: { emailId: '1' }, description: 'Archive' },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new EmailPilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({ id: 'task-1', description: 'Process', params: { emails: [] } });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('registers email-specific tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new EmailPilot(deps);

    expect(deps.toolRegistry.hasTool('email.archive')).toBe(true);
    expect(deps.toolRegistry.hasTool('email.draft_reply')).toBe(true);
    expect(deps.toolRegistry.hasTool('email.flag')).toBe(true);
    expect(deps.toolRegistry.hasTool('email.schedule_send')).toBe(true);
  });

  it('has agent.handoff meta-tool available for cross-agent delegation', () => {
    const deps = createDeps();
    new EmailPilot(deps);

    expect(deps.toolRegistry.hasTool('agent.handoff')).toBe(true);

    const handoffTool = deps.toolRegistry.getTool('agent.handoff');
    expect(handoffTool).toBeDefined();
    expect(handoffTool!.category).toBe('meta');
  });
});
