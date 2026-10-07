import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResearchPilot, ResearchSource } from '../../agents/research-pilot.js';
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
        { toolName: 'research.summarize', args: { content: 'test' }, description: 'Summarize' },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'academic', confidence: 0.9 }),
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

describe('ResearchPilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has correct default configuration', () => {
    const pilot = new ResearchPilot(createDeps());
    expect(pilot.name).toBe('Research Pilot');
    expect(pilot.defaultPermission).toBe(PermissionLevel.ACT_LOW);
    expect(pilot.icon).toBe('search');
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new ResearchPilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('AI summarizes research and extracts key findings', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          summary: 'AI safety is a critical field with rapid progress.',
          keyFindings: ['Alignment research is growing', 'Governance frameworks emerging'],
        }),
        usage: { tokens: 150, cost: 0.003 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          { toolName: 'research.summarize', args: { content: 'test' }, description: 'Summarize' },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new ResearchPilot(createDeps({ aiEngine }));
    pilot.start();

    const sources: ResearchSource[] = [
      {
        title: 'Source A',
        url: 'https://a.com',
        snippet: 'Low relevance content',
        relevance: 0.3,
      },
      {
        title: 'Source B',
        url: 'https://b.com',
        snippet: 'High relevance content',
        relevance: 0.9,
      },
      { title: 'Source C', url: 'https://c.com', snippet: 'Medium relevance', relevance: 0.6 },
    ];

    await pilot.run({
      id: 'task-1',
      description: 'Research',
      params: { query: 'AI safety', sources },
    });

    const result = pilot.getResearchResult();
    expect(result).not.toBeNull();
    expect(result!.query).toBe('AI safety');
    expect(result!.summary).toBe('AI safety is a critical field with rapid progress.');
    expect(result!.keyFindings).toHaveLength(2);
    // Sources should be ranked by relevance (highest first)
    expect(result!.sources[0]!.title).toBe('Source B');
    expect(inferMock).toHaveBeenCalled();
  });

  it('handles empty sources gracefully', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'research.summarize', args: { content: 'test' }, description: 'Summarize' },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new ResearchPilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({ id: 'task-1', description: 'Research', params: { query: 'test' } });

    const result = pilot.getResearchResult();
    expect(result!.summary).toContain('No sources found');
    expect(result!.sources).toHaveLength(0);
  });

  it('transitions to DONE on success', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'research.summarize', args: { content: 'test' }, description: 'Summarize' },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new ResearchPilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({ id: 'task-1', description: 'Research', params: { query: 'test' } });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('registers research-specific tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new ResearchPilot(deps);

    expect(deps.toolRegistry.hasTool('research.web_fetch')).toBe(true);
    expect(deps.toolRegistry.hasTool('research.summarize')).toBe(true);
    expect(deps.toolRegistry.hasTool('research.extract_citations')).toBe(true);
    expect(deps.toolRegistry.hasTool('research.export_to_docs')).toBe(true);
  });

  it('reasoning trace is populated after execution', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'research.summarize', args: { content: 'test' }, description: 'Summarize' },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new ResearchPilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({ id: 'task-1', description: 'Research', params: { query: 'AI' } });

    const trace = pilot.getReasoningTrace();
    expect(trace.length).toBeGreaterThan(0);
    const phases = trace.map((t) => t.phase);
    expect(phases).toContain('observe');
    expect(phases).toContain('plan');
  });
});
