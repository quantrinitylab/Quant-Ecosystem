import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContentPilot } from '../../agents/content-pilot.js';
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
        {
          toolName: 'content.draft',
          args: { topic: 'test', format: 'article' },
          description: 'Draft content',
        },
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

describe('ContentPilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has SUGGEST default permission', () => {
    const pilot = new ContentPilot(createDeps());
    expect(pilot.defaultPermission).toBe(PermissionLevel.SUGGEST);
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new ContentPilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('creates content draft with AI-generated outline and body', async () => {
    const aiContent = {
      outline: ['Introduction to ML', 'Core concepts', 'Applications', 'Future trends'],
      body: '## Introduction to ML\n\nMachine learning is a subset of AI that enables systems to learn from data.\n\n## Core concepts\n\nKey concepts include supervised and unsupervised learning.',
    };
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify(aiContent),
        usage: { tokens: 200, cost: 0.004 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'content.draft',
            args: { topic: 'ML', format: 'article' },
            description: 'Draft',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new ContentPilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({
      id: 'task-1',
      description: 'Create content',
      params: { topic: 'machine learning', format: 'article', keywords: ['AI', 'ML'] },
    });

    const result = pilot.getContentResult();
    expect(result!.drafts).toHaveLength(1);
    expect(result!.drafts[0]!.format).toBe('article');
    expect(result!.outline).toEqual(aiContent.outline);
    expect(result!.estimatedReadTime).toBeGreaterThan(0);
    expect(inferMock).toHaveBeenCalled();
  });

  it('falls back to template when AI returns invalid JSON', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: 'invalid json response',
        usage: { tokens: 50, cost: 0.001 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'content.draft',
            args: { topic: 'tech', format: 'social' },
            description: 'Draft',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new ContentPilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({
      id: 'task-1',
      description: 'Create content',
      params: { topic: 'tech', format: 'social' },
    });

    const result = pilot.getContentResult();
    expect(result!.outline).toHaveLength(3);
  });

  it('transitions to DONE on success', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          outline: ['Intro'],
          body: 'Some content about the topic.',
        }),
        usage: { tokens: 50, cost: 0.001 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'content.draft',
            args: { topic: 'test', format: 'article' },
            description: 'Draft',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new ContentPilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({ id: 'task-1', description: 'Create', params: { topic: 'test' } });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('registers content-specific tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new ContentPilot(deps);

    expect(deps.toolRegistry.hasTool('content.draft')).toBe(true);
    expect(deps.toolRegistry.hasTool('content.edit')).toBe(true);
    expect(deps.toolRegistry.hasTool('content.seo_optimize')).toBe(true);
  });

  it('has agent.handoff tool available', () => {
    const deps = createDeps();
    new ContentPilot(deps);

    expect(deps.toolRegistry.hasTool('agent.handoff')).toBe(true);
  });
});
