import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MeetingPilot, Meeting } from '../../agents/meeting-pilot.js';
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
          toolName: 'meeting.summarize_transcript',
          args: { transcript: 'test' },
          description: 'Summarize',
        },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'meeting', confidence: 0.9 }),
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

describe('MeetingPilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has ACT_LOW default permission', () => {
    const pilot = new MeetingPilot(createDeps());
    expect(pilot.defaultPermission).toBe(PermissionLevel.ACT_LOW);
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new MeetingPilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('action items extracted via AI', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content:
        'Summary: Sprint Planning meeting discussed backlog review and sprint goals. ' +
        'Action items identified for all attendees.',
      usage: { tokens: 80, cost: 0.002 },
    });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new MeetingPilot(createDeps({ aiEngine }));
    pilot.start();

    const meetings: Meeting[] = [
      {
        id: 'm1',
        title: 'Sprint Planning',
        startTime: Date.now(),
        attendees: ['alice', 'bob'],
        agenda: ['Backlog review', 'Sprint goals'],
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Notes', params: { action: 'notes', meetings } });

    const result = pilot.getMeetingResult();
    expect(result!.notes).toHaveLength(1);
    expect(result!.notes[0]!.actionItems.length).toBeGreaterThan(0);
    expect(result!.followUps.length).toBeGreaterThan(0);
    // AI infer was called (at least for notes generation + planning loop)
    expect(inferMock).toHaveBeenCalled();
  });

  it('generates prep notes via AI', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content:
        'Preparation notes for Sprint Planning:\n- Review current velocity\n- Identify blockers',
      usage: { tokens: 60, cost: 0.001 },
    });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new MeetingPilot(createDeps({ aiEngine }));
    pilot.start();

    const meetings: Meeting[] = [
      {
        id: 'm1',
        title: 'Sprint Planning',
        startTime: Date.now(),
        attendees: ['alice', 'bob'],
        agenda: ['Backlog review', 'Sprint goals'],
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Prep', params: { action: 'prep', meetings } });

    const result = pilot.getMeetingResult();
    expect(result!.prep).toHaveLength(1);
    expect(result!.prep[0]!.prepNotes.length).toBeGreaterThan(0);
    expect(result!.prep[0]!.prepNotes.some((n) => n.includes('Sprint Planning'))).toBe(true);
    // AI was called for prep
    expect(inferMock).toHaveBeenCalled();
  });

  it('tool registry is used for task creation', () => {
    const deps = createDeps();
    new MeetingPilot(deps);

    expect(deps.toolRegistry.hasTool('meeting.summarize_transcript')).toBe(true);
    expect(deps.toolRegistry.hasTool('meeting.extract_actions')).toBe(true);
    expect(deps.toolRegistry.hasTool('meeting.create_task')).toBe(true);
    expect(deps.toolRegistry.hasTool('meeting.notify_assignee')).toBe(true);
  });

  it('trace shows planning steps after execution', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'meeting.summarize_transcript',
          args: { transcript: 'test' },
          description: 'Summarize',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new MeetingPilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({
      id: 'task-1',
      description: 'Prep',
      params: { action: 'prep', meetings: [] },
    });

    const trace = pilot.getReasoningTrace();
    expect(trace.length).toBeGreaterThan(0);

    const phases = trace.map((t) => t.phase);
    expect(phases).toContain('observe');
    expect(phases).toContain('plan');
  });

  it('transitions to DONE on success', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'meeting.summarize_transcript',
          args: { transcript: 'test' },
          description: 'Summarize',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new MeetingPilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({
      id: 'task-1',
      description: 'Prep',
      params: { action: 'prep', meetings: [] },
    });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });
});
