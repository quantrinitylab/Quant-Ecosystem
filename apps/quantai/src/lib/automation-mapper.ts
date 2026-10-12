// ============================================================================
// QuantAI - Automation canvas <-> backend schema mapping
// Pure functions (no fetch, no React) so they are unit-testable.
// ============================================================================

import type { Automation, AutomationRun } from '../types';

export interface CanvasNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'delay';
  name: string;
  description: string;
  icon: string;
  x: number;
  y: number;
  config: Record<string, string | number | boolean>;
}

export interface CanvasConnection {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface ExecutionLog {
  id: string;
  workflowName: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'error' | 'partial';
  nodesExecuted: number;
  duration: number;
  error?: string;
}

export interface WorkflowPayload {
  name: string;
  description: string;
  trigger: {
    type: 'schedule' | 'event' | 'condition' | 'webhook' | 'manual';
    config: Record<string, unknown>;
    schedule?: string;
    event?: string;
    webhook?: { url: string; secret: string };
  };
  actions: Array<{
    type: string;
    params: Record<string, unknown>;
    order: number;
  }>;
  conditions: Array<{
    field: string;
    operator: 'equals' | 'not-equals' | 'contains' | 'gt' | 'lt' | 'exists';
    value: unknown;
  }>;
  isActive: boolean;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v);
}

/**
 * Convert the canvas nodes into the backend create/update payload.
 * The FIRST trigger node becomes the automation trigger; every other node
 * becomes an action (in canvas order). 'If/Else' condition nodes with a
 * field/operator/value config become backend conditions instead.
 */
export function workflowNodesToPayload(
  nodes: CanvasNode[],
  workflowName: string,
  isEnabled: boolean,
): WorkflowPayload {
  const triggerNode = nodes.find((n) => n.type === 'trigger');

  let trigger: WorkflowPayload['trigger'] = { type: 'manual', config: {} };
  if (triggerNode) {
    const cfg = { ...triggerNode.config } as Record<string, unknown>;
    switch (triggerNode.name) {
      case 'Schedule':
        trigger = { type: 'schedule', config: cfg, schedule: str(triggerNode.config['cron']) || '0 9 * * *' };
        break;
      case 'Webhook':
        trigger = {
          type: 'webhook',
          config: cfg,
          webhook: { url: str(triggerNode.config['url']), secret: str(triggerNode.config['secret']) },
        };
        break;
      case 'Email Received':
        trigger = { type: 'event', config: cfg, event: 'email.received' };
        break;
      case 'Device Event':
        trigger = { type: 'event', config: cfg, event: str(triggerNode.config['event']) || 'stateChange' };
        break;
      default:
        trigger = { type: 'manual', config: cfg };
        break;
    }
  }

  const actions: WorkflowPayload['actions'] = [];
  const conditions: WorkflowPayload['conditions'] = [];
  const rest = nodes.filter((n) => n.type !== 'trigger');
  rest.forEach((node, idx) => {
    if (
      node.type === 'condition' &&
      node.name === 'If/Else' &&
      typeof node.config['field'] === 'string' &&
      typeof node.config['operator'] === 'string'
    ) {
      const op = str(node.config['operator']);
      const validOps = ['equals', 'not-equals', 'contains', 'gt', 'lt', 'exists'];
      conditions.push({
        field: str(node.config['field']),
        operator: (validOps.includes(op) ? op : 'equals') as WorkflowPayload['conditions'][number]['operator'],
        value: node.config['value'] ?? '',
      });
      return;
    }
    actions.push({
      type: node.name,
      params: { ...node.config } as Record<string, unknown>,
      order: idx,
    });
  });

  return {
    name: workflowName.trim() || 'Untitled Workflow',
    description: `Built in the QuantAI automation builder (${rest.length} step${rest.length === 1 ? '' : 's'})`,
    trigger,
    actions,
    conditions,
    isActive: isEnabled,
  };
}

/**
 * Convert a persisted automation back into canvas nodes/connections so a
 * saved workflow can be re-opened and edited. Nodes are laid out left to
 * right and chained in execution order.
 */
export function automationToCanvas(automation: Automation): {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
} {
  const nodes: CanvasNode[] = [];
  const connections: CanvasConnection[] = [];

  const triggerIcon: Record<string, string> = {
    schedule: '⏰',
    webhook: '🔗',
    event: '📧',
    condition: '🔀',
    manual: '▶️',
  };
  const triggerName: Record<string, string> = {
    schedule: 'Schedule',
    webhook: 'Webhook',
    event: 'Event',
    condition: 'Condition',
    manual: 'Manual',
  };
  const t = automation.trigger?.type ?? 'manual';
  nodes.push({
    id: 't1',
    type: 'trigger',
    name: triggerName[t] ?? 'Manual',
    description: `Trigger: ${t}`,
    icon: triggerIcon[t] ?? '▶️',
    x: 100,
    y: 150,
    config: { ...(automation.trigger?.config ?? {}) } as Record<string, string | number | boolean>,
  });

  automation.actions.forEach((action, i) => {
    const id = `a${i + 1}`;
    nodes.push({
      id,
      type: 'action',
      name: action.type,
      description: `Step ${i + 1}`,
      icon: '⚙️',
      x: 100 + (i + 1) * 250,
      y: 150,
      config: { ...(action.params ?? {}) } as Record<string, string | number | boolean>,
    });
    const prev = i === 0 ? 't1' : `a${i}`;
    connections.push({ id: `conn-${prev}-${id}`, sourceId: prev, targetId: id });
  });

  automation.conditions.forEach((cond, i) => {
    const id = `c${i + 1}`;
    nodes.push({
      id,
      type: 'condition',
      name: 'If/Else',
      description: 'Condition',
      icon: '🔀',
      x: 100,
      y: 350 + i * 150,
      config: { field: str(cond.field), operator: str(cond.operator), value: str(cond.value) },
    });
  });

  return { nodes, connections };
}

/**
 * Convert a real persisted backend run into the history-panel log entry.
 * Defensive: malformed timestamps/checkpoints degrade to safe defaults,
 * never to fabricated data.
 */
export function runToExecutionLog(run: AutomationRun, workflowName: string): ExecutionLog {
  const started = new Date(run.startedAt).getTime();
  const finished = run.finishedAt ? new Date(run.finishedAt).getTime() : NaN;
  const duration =
    Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : 0;
  const checkpoints = Array.isArray(run.checkpoints) ? run.checkpoints : [];
  const status: ExecutionLog['status'] =
    run.status === 'completed' ? 'success' : run.status === 'failed' ? 'error' : 'partial';

  return {
    id: String(run.id ?? `run-${Date.now()}`),
    workflowName,
    startedAt: run.startedAt,
    completedAt: run.finishedAt ?? run.startedAt,
    status,
    nodesExecuted: checkpoints.length,
    duration,
    ...(run.error ? { error: run.error } : {}),
  };
}

/** Labeled demo canvas content — explicitly local-only until saved. */
export function demoTemplateNodes(): CanvasNode[] {
  return [
    { id: 'n1', type: 'trigger', name: 'Schedule', description: 'Run daily at 9am', icon: '⏰', x: 100, y: 150, config: { cron: '0 9 * * *', timezone: 'UTC' } },
    { id: 'n2', type: 'action', name: 'AI Generate', description: 'Generate daily summary', icon: '🤖', x: 350, y: 150, config: { prompt: 'Summarize today...', model: 'gpt-4', maxTokens: 500 } },
    { id: 'n3', type: 'action', name: 'Send Email', description: 'Send summary email', icon: '✉️', x: 600, y: 150, config: { to: 'user@example.com', subject: 'Daily Summary', body: '' } },
  ];
}

export function demoTemplateConnections(): CanvasConnection[] {
  return [
    { id: 'conn1', sourceId: 'n1', targetId: 'n2' },
    { id: 'conn2', sourceId: 'n2', targetId: 'n3' },
  ];
}
