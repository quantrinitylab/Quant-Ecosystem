// ============================================================================
// automation-mapper: canvas <-> backend schema mapping + run -> history entry
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  workflowNodesToPayload,
  automationToCanvas,
  runToExecutionLog,
  demoTemplateNodes,
  demoTemplateConnections,
  type CanvasNode,
} from '../lib/automation-mapper';
import type { Automation, AutomationRun } from '../types';

function node(over: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: over.id ?? 'n1',
    type: over.type ?? 'action',
    name: over.name ?? 'AI Generate',
    description: over.description ?? 'desc',
    icon: over.icon ?? '🤖',
    x: over.x ?? 0,
    y: over.y ?? 0,
    config: over.config ?? {},
  };
}

function run(over: Partial<AutomationRun> = {}): AutomationRun {
  return {
    id: over.id ?? 'run-1',
    automationId: over.automationId ?? 'a1',
    userId: over.userId ?? 'u1',
    status: over.status ?? 'completed',
    currentStep: over.currentStep ?? 2,
    checkpoints: over.checkpoints ?? [],
    ...(over.error ? { error: over.error } : {}),
    startedAt: over.startedAt ?? '2026-10-12T08:00:00.000Z',
    ...(over.finishedAt ? { finishedAt: over.finishedAt } : {}),
  };
}

describe('workflowNodesToPayload', () => {
  it('maps an empty canvas to a manual trigger with no actions', () => {
    const p = workflowNodesToPayload([], '  ', true);
    expect(p.name).toBe('Untitled Workflow');
    expect(p.trigger).toEqual({ type: 'manual', config: {} });
    expect(p.actions).toEqual([]);
    expect(p.conditions).toEqual([]);
    expect(p.isActive).toBe(true);
  });

  it('maps a Schedule trigger with its cron expression', () => {
    const p = workflowNodesToPayload(
      [node({ id: 't1', type: 'trigger', name: 'Schedule', config: { cron: '0 7 * * *', timezone: 'UTC' } })],
      'Morning',
      true,
    );
    expect(p.trigger.type).toBe('schedule');
    expect(p.trigger.schedule).toBe('0 7 * * *');
  });

  it('maps Webhook / Email / Device triggers', () => {
    const webhook = workflowNodesToPayload(
      [node({ id: 't', type: 'trigger', name: 'Webhook', config: { url: 'https://x.test/hook', secret: 's3cr3t' } })],
      'W', true,
    );
    expect(webhook.trigger.type).toBe('webhook');
    expect(webhook.trigger.webhook).toEqual({ url: 'https://x.test/hook', secret: 's3cr3t' });

    const email = workflowNodesToPayload(
      [node({ id: 't', type: 'trigger', name: 'Email Received', config: { folder: 'inbox' } })],
      'W', true,
    );
    expect(email.trigger.type).toBe('event');
    expect(email.trigger.event).toBe('email.received');

    const device = workflowNodesToPayload(
      [node({ id: 't', type: 'trigger', name: 'Device Event', config: { event: 'doorOpen' } })],
      'W', true,
    );
    expect(device.trigger.type).toBe('event');
    expect(device.trigger.event).toBe('doorOpen');
  });

  it('falls back to manual for unknown trigger names', () => {
    const p = workflowNodesToPayload(
      [node({ id: 't', type: 'trigger', name: 'Quantum Pulse' })],
      'W', false,
    );
    expect(p.trigger.type).toBe('manual');
    expect(p.isActive).toBe(false);
  });

  it('uses the FIRST trigger node when several exist', () => {
    const p = workflowNodesToPayload(
      [
        node({ id: 't1', type: 'trigger', name: 'Webhook', config: { url: 'u' } }),
        node({ id: 't2', type: 'trigger', name: 'Schedule', config: { cron: '1 1 1 1 1' } }),
      ],
      'W', true,
    );
    expect(p.trigger.type).toBe('webhook');
  });

  it('maps action nodes to ordered actions with params', () => {
    const p = workflowNodesToPayload(
      [
        node({ id: 'a1', name: 'AI Generate', config: { prompt: 'hi', maxTokens: 100 } }),
        node({ id: 'd1', type: 'delay', name: 'Wait', config: { duration: 5 } }),
      ],
      'W', true,
    );
    expect(p.actions).toEqual([
      { type: 'AI Generate', params: { prompt: 'hi', maxTokens: 100 }, order: 0 },
      { type: 'Wait', params: { duration: 5 }, order: 1 },
    ]);
  });

  it('maps If/Else nodes to conditions and sanitizes the operator', () => {
    const p = workflowNodesToPayload(
      [node({ id: 'c1', type: 'condition', name: 'If/Else', config: { field: 'priority', operator: 'gt', value: 3 } })],
      'W', true,
    );
    expect(p.conditions).toEqual([{ field: 'priority', operator: 'gt', value: 3 }]);
    expect(p.actions).toEqual([]);

    const bad = workflowNodesToPayload(
      [node({ id: 'c1', type: 'condition', name: 'If/Else', config: { field: 'f', operator: 'nonsense', value: 'x' } })],
      'W', true,
    );
    expect(bad.conditions[0]!.operator).toBe('equals');
  });

  it('treats non-If/Else condition nodes as actions', () => {
    const p = workflowNodesToPayload(
      [node({ id: 'c1', type: 'condition', name: 'Filter', config: { expression: 'x>1', passThrough: true } })],
      'W', true,
    );
    expect(p.conditions).toEqual([]);
    expect(p.actions).toHaveLength(1);
    expect(p.actions[0]!.type).toBe('Filter');
  });
});

describe('automationToCanvas', () => {
  const automation: Automation = {
    id: 'a1',
    userId: 'u1',
    name: 'Saved flow',
    description: 'd',
    trigger: { type: 'schedule', config: { cron: '0 9 * * *' }, schedule: '0 9 * * *' },
    actions: [
      { id: 'x1', type: 'AI Generate', params: { prompt: 'p' }, order: 0, retryOnFail: false, timeout: 30000 },
      { id: 'x2', type: 'Send Email', params: { to: 'a@b.c' }, order: 1, retryOnFail: false, timeout: 30000 },
    ],
    conditions: [{ field: 'priority', operator: 'gt', value: 3 }],
    isActive: true,
    executionCount: 2,
    createdAt: '2026-10-01T00:00:00.000Z',
  };

  it('rebuilds trigger, chained actions, and conditions', () => {
    const { nodes, connections } = automationToCanvas(automation);
    expect(nodes).toHaveLength(4); // trigger + 2 actions + 1 condition
    expect(nodes[0]!.type).toBe('trigger');
    expect(nodes[0]!.name).toBe('Schedule');
    expect(nodes[1]!.name).toBe('AI Generate');
    expect(nodes[1]!.config).toEqual({ prompt: 'p' });
    // actions are chained in execution order
    expect(connections).toHaveLength(2);
    expect(connections[0]).toMatchObject({ sourceId: 't1', targetId: 'a1' });
    expect(connections[1]).toMatchObject({ sourceId: 'a1', targetId: 'a2' });
    expect(nodes[3]!.type).toBe('condition');
  });

  it('degrades unknown trigger types to Manual', () => {
    const weird = { ...automation, trigger: { type: 'telepathy', config: {} } } as unknown as Automation;
    const { nodes } = automationToCanvas(weird);
    expect(nodes[0]!.name).toBe('Manual');
  });
});

describe('runToExecutionLog', () => {
  it('maps a completed run to a success entry with real duration', () => {
    const entry = runToExecutionLog(
      run({
        id: 'run-9',
        status: 'completed',
        checkpoints: [
          { stepIndex: 0, type: 'AI Generate', status: 'completed', at: '2026-10-12T08:00:01.000Z' },
          { stepIndex: 1, type: 'Send Email', status: 'completed', at: '2026-10-12T08:00:12.000Z' },
        ],
        startedAt: '2026-10-12T08:00:00.000Z',
        finishedAt: '2026-10-12T08:00:12.500Z',
      }),
      'Morning',
    );
    expect(entry.id).toBe('run-9');
    expect(entry.workflowName).toBe('Morning');
    expect(entry.status).toBe('success');
    expect(entry.nodesExecuted).toBe(2);
    expect(entry.duration).toBe(12500);
    expect(entry.error).toBeUndefined();
  });

  it('maps a failed run to an error entry with the backend message', () => {
    const entry = runToExecutionLog(
      run({ status: 'failed', error: 'Email service timeout' }),
      'Morning',
    );
    expect(entry.status).toBe('error');
    expect(entry.error).toBe('Email service timeout');
  });

  it('maps a still-running run to partial, never fabricated completion', () => {
    const entry = runToExecutionLog(run({ status: 'running' }), 'Morning');
    expect(entry.status).toBe('partial');
    expect(entry.duration).toBe(0);
    expect(entry.completedAt).toBe(entry.startedAt);
  });

  it('degrades malformed records safely instead of inventing data', () => {
    const broken = run({
      checkpoints: 'not-an-array' as unknown as [],
      startedAt: 'garbage',
      finishedAt: 'also-garbage',
    });
    const entry = runToExecutionLog(broken, 'Morning');
    expect(entry.nodesExecuted).toBe(0);
    expect(entry.duration).toBe(0);
    expect(entry.status).toBe('success'); // status itself is intact
  });
});

describe('demo template', () => {
  it('is a local-only starting point, not execution history', () => {
    const nodes = demoTemplateNodes();
    expect(nodes).toHaveLength(3);
    expect(nodes[0]!.type).toBe('trigger');
    const conns = demoTemplateConnections();
    expect(conns).toHaveLength(2);
    expect(conns[0]).toMatchObject({ sourceId: 'n1', targetId: 'n2' });
  });
});
