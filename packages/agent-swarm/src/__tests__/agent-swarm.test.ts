import { SwarmOrchestrator } from '../orchestrator/swarm-orchestrator.js';
import { SwarmBudget } from '../budget/swarm-budget.js';
import { SharedScratchpad } from '../scratchpad/shared-scratchpad.js';
import { SwarmAudit } from '../audit/swarm-audit.js';
import { MessageBus } from '../bus/message-bus.js';
import type { GoalState } from '../types.js';

describe('SwarmOrchestrator', () => {
  it('creates a goal with pending state', () => {
    const o = new SwarmOrchestrator();
    const g = o.createGoal('test goal', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    expect(g.state).toBe('pending');
    expect(g.description).toBe('test goal');
    expect(g.subGoals).toHaveLength(0);
  });

  it('decomposes goal into subgoals', () => {
    const o = new SwarmOrchestrator();
    const g = o.createGoal('t', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    const subs = o.decompose(g.id, ['a', 'b', 'c']);
    expect(subs).toHaveLength(3);
    expect(g.state).toBe('decomposing');
    expect(subs[0]!.parentId).toBe(g.id);
  });

  it('assigns agent and marks subgoal running', () => {
    const o = new SwarmOrchestrator();
    const g = o.createGoal('t', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    const [s1] = o.decompose(g.id, ['a']);
    const a = o.assign(s1!.id, 'agent-1');
    expect(a).not.toBeNull();
    expect(a!.agentId).toBe('agent-1');
    expect(o.getSubGoal(s1!.id)!.state).toBe('running');
  });

  it('completes subgoal and tracks progress', () => {
    const o = new SwarmOrchestrator();
    const g = o.createGoal('t', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    const [s1, s2] = o.decompose(g.id, ['a', 'b']);
    o.assign(s1!.id, 'ag1');
    o.completeSubGoal(s1!.id);
    expect(o.getProgress(g.id)).toEqual({ total: 2, completed: 1, failed: 0 });
    o.assign(s2!.id, 'ag2');
    o.completeSubGoal(s2!.id);
    expect(o.getProgress(g.id)).toEqual({ total: 2, completed: 2, failed: 0 });
  });

  it('fails subgoal and retries with exponential backoff', () => {
    const o = new SwarmOrchestrator();
    const g = o.createGoal('t', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    o.setRetryConfig(g.id, { maxRetries: 3, backoffFactor: 2, initialDelayMs: 100 });
    const [s1] = o.decompose(g.id, ['a']);
    o.assign(s1!.id, 'ag1');
    o.failSubGoal(s1!.id);
    expect(o.getSubGoal(s1!.id)!.state).toBe('retrying');
    expect(o.getRetryDelay(s1!.id)).toBe(100); // 100 * 2^0
    o.failSubGoal(s1!.id);
    expect(o.getRetryDelay(s1!.id)).toBe(200); // 100 * 2^1
    o.failSubGoal(s1!.id);
    expect(o.getRetryDelay(s1!.id)).toBe(400); // 100 * 2^2
    o.failSubGoal(s1!.id); // exceeds max retries
    expect(o.getSubGoal(s1!.id)!.state).toBe('failed');
  });

  it('respects goal dependencies - blocks assignment until dependency completes', () => {
    const o = new SwarmOrchestrator();
    const g = o.createGoal('t', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    const [s1] = o.decompose(g.id, ['first', 'second'], { dependencies: [[], []] });
    // Make s2 depend on s1 by re-decomposing with proper deps
    const g2 = o.createGoal('t2', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    const subs = o.decompose(g2.id, ['first', 'second'], { dependencies: [[], [s1!.id]] });
    // Cannot assign s2 because s1 not completed
    const result = o.assign(subs[1]!.id, 'ag1');
    expect(result).toBeNull();
    // Complete dependency
    o.assign(s1!.id, 'ag1');
    o.completeSubGoal(s1!.id);
    // Now can assign
    const a = o.assign(subs[1]!.id, 'ag2');
    expect(a).not.toBeNull();
  });

  it('selects next subgoal by priority', () => {
    const o = new SwarmOrchestrator();
    const g = o.createGoal('t', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    o.decompose(g.id, ['low', 'high', 'medium'], { priorities: [1, 10, 5] });
    const next = o.getNextByPriority(g.id);
    expect(next).not.toBeNull();
    expect(next!.description).toBe('high');
  });

  it('cancels a goal and all pending subgoals', () => {
    const o = new SwarmOrchestrator();
    const g = o.createGoal('t', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    const [s1, s2] = o.decompose(g.id, ['a', 'b']);
    o.assign(s1!.id, 'ag1');
    o.completeSubGoal(s1!.id);
    o.cancelGoal(g.id);
    expect(g.state).toBe('cancelled');
    expect(o.getSubGoal(s1!.id)!.state).toBe('completed'); // already done
    expect(o.getSubGoal(s2!.id)!.state).toBe('cancelled');
  });

  it('fires observation hooks on state change', () => {
    const o = new SwarmOrchestrator();
    const changes: { goalId: string; from: GoalState; to: GoalState }[] = [];
    o.addObserver({ onStateChange: (id, from, to) => changes.push({ goalId: id, from, to }) });
    const g = o.createGoal('t', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    o.decompose(g.id, ['a']);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]!.to).toBe('decomposing');
  });

  it('fires progress hooks on completion', () => {
    const o = new SwarmOrchestrator();
    const progressUpdates: { completed: number; total: number }[] = [];
    o.addObserver({
      onProgress: (_id, completed, total) => progressUpdates.push({ completed, total }),
    });
    const g = o.createGoal('t', { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 });
    const [s1] = o.decompose(g.id, ['a', 'b']);
    o.assign(s1!.id, 'ag1');
    o.completeSubGoal(s1!.id);
    expect(progressUpdates).toHaveLength(1);
    expect(progressUpdates[0]).toEqual({ completed: 1, total: 2 });
  });

  it('checks timeout correctly', () => {
    const o = new SwarmOrchestrator();
    const g = o.createGoal('t', { maxTimeMs: 0, maxTokens: 100, maxCostCents: 50 });
    expect(o.checkTimeout(g.id)).toBe(true);
  });
});

describe('SwarmBudget', () => {
  it('tracks usage correctly', () => {
    const b = new SwarmBudget();
    b.setBudget('g1', { maxTimeMs: 1000, maxTokens: 100, maxCostCents: 50 });
    b.track('g1', 30, 15, 300);
    expect(b.getUsage('g1')).toEqual({ tokens: 30, cost: 15, time: 300 });
  });

  it('detects over-budget', () => {
    const b = new SwarmBudget();
    b.setBudget('g1', { maxTimeMs: 1000, maxTokens: 100, maxCostCents: 50 });
    b.track('g1', 101, 0, 0);
    expect(b.isOverBudget('g1')).toBe(true);
  });

  it('detects pause threshold at 80%', () => {
    const b = new SwarmBudget();
    b.setBudget('g1', { maxTimeMs: 1000, maxTokens: 100, maxCostCents: 50 });
    b.track('g1', 80, 0, 0);
    expect(b.shouldPause('g1')).toBe(true);
  });

  it('resets usage', () => {
    const b = new SwarmBudget();
    b.setBudget('g1', { maxTimeMs: 1000, maxTokens: 100, maxCostCents: 50 });
    b.track('g1', 80, 40, 800);
    b.reset('g1');
    expect(b.getUsage('g1')).toEqual({ tokens: 0, cost: 0, time: 0 });
    expect(b.isOverBudget('g1')).toBe(false);
  });

  it('allocates budget to sub-goals', () => {
    const b = new SwarmBudget();
    b.setBudget('parent', { maxTimeMs: 5000, maxTokens: 500, maxCostCents: 200 });
    b.allocateSubGoal('parent', 'sub1', { maxTimeMs: 2000, maxTokens: 200, maxCostCents: 80 });
    const sub = b.getSubGoalBudget('parent', 'sub1');
    expect(sub).not.toBeNull();
    expect(sub!.maxTokens).toBe(200);
  });

  it('transfers budget between goals', () => {
    const b = new SwarmBudget();
    b.setBudget('g1', { maxTimeMs: 1000, maxTokens: 100, maxCostCents: 50 });
    b.setBudget('g2', { maxTimeMs: 1000, maxTokens: 50, maxCostCents: 50 });
    const result = b.transfer('g1', 'g2', 30, 10, 200);
    expect(result).toBe(true);
    // g2 now has more tokens
    b.track('g2', 79, 0, 0);
    expect(b.isOverBudget('g2')).toBe(false); // 79 <= 80
  });

  it('rejects transfer when insufficient budget', () => {
    const b = new SwarmBudget();
    b.setBudget('g1', { maxTimeMs: 1000, maxTokens: 100, maxCostCents: 50 });
    b.setBudget('g2', { maxTimeMs: 1000, maxTokens: 50, maxCostCents: 50 });
    b.track('g1', 90, 0, 0);
    const result = b.transfer('g1', 'g2', 50, 0, 0); // only 10 remaining
    expect(result).toBe(false);
  });

  it('fires alert callbacks at thresholds', () => {
    const b = new SwarmBudget();
    const alerts: { id: string; threshold: number }[] = [];
    b.onAlert((id, _usage, threshold) => alerts.push({ id, threshold }));
    b.setBudget('g1', { maxTimeMs: 1000, maxTokens: 100, maxCostCents: 50 });
    b.track('g1', 80, 0, 0); // hits 0.8 threshold
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.threshold).toBe(0.8);
    b.track('g1', 10, 0, 0); // hits 0.9 threshold
    expect(alerts).toHaveLength(2);
  });

  it('records budget history', () => {
    const b = new SwarmBudget();
    b.setBudget('g1', { maxTimeMs: 1000, maxTokens: 100, maxCostCents: 50 });
    b.track('g1', 10, 5, 100);
    b.reset('g1');
    const hist = b.getHistory();
    expect(hist.length).toBeGreaterThanOrEqual(2);
    expect(hist.some((h) => h.action === 'track')).toBe(true);
    expect(hist.some((h) => h.action === 'reset')).toBe(true);
  });
});

describe('MessageBus', () => {
  it('publishes and delivers to subscribers', () => {
    const bus = new MessageBus();
    const received: unknown[] = [];
    bus.subscribe('topic.test', (e) => received.push(e.payload));
    bus.publish('topic.test', { data: 42 }, 'sender1');
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ data: 42 });
  });

  it('supports wildcard subscriptions with *', () => {
    const bus = new MessageBus();
    const received: string[] = [];
    bus.subscribe('events.*', (e) => received.push(e.topic));
    bus.publish('events.created', 'a', 's');
    bus.publish('events.deleted', 'b', 's');
    bus.publish('other.created', 'c', 's');
    expect(received).toEqual(['events.created', 'events.deleted']);
  });

  it('supports # wildcard for multi-level matching', () => {
    const bus = new MessageBus();
    const received: string[] = [];
    bus.subscribe('events.#', (e) => received.push(e.topic));
    bus.publish('events.user.created', 'a', 's');
    bus.publish('events.system', 'b', 's');
    expect(received).toEqual(['events.user.created', 'events.system']);
  });

  it('acknowledges messages', () => {
    const bus = new MessageBus();
    const evt = bus.publish('topic', 'data', 'sender');
    expect(evt.acked).toBe(false);
    expect(bus.getPending()).toHaveLength(1);
    bus.ack(evt.id);
    expect(evt.acked).toBe(true);
    expect(bus.getPending()).toHaveLength(0);
  });

  it('maintains message history', () => {
    const bus = new MessageBus();
    bus.publish('a', 1, 's');
    bus.publish('b', 2, 's');
    bus.publish('a', 3, 's');
    expect(bus.getHistory()).toHaveLength(3);
    expect(bus.getHistory('a')).toHaveLength(2);
  });

  it('unsubscribes correctly', () => {
    const bus = new MessageBus();
    const received: unknown[] = [];
    const subId = bus.subscribe('topic', (e) => received.push(e.payload));
    bus.publish('topic', 'first', 's');
    bus.unsubscribe('topic', subId);
    bus.publish('topic', 'second', 's');
    expect(received).toHaveLength(1);
  });
});

describe('SharedScratchpad', () => {
  it('writes and reads values', () => {
    const p = new SharedScratchpad();
    p.write('g1', 'key', 'value', 'agent1');
    expect(p.read('g1', 'key')).toBe('value');
  });

  it('returns null for missing keys', () => {
    const p = new SharedScratchpad();
    expect(p.read('g1', 'missing')).toBeNull();
  });

  it('tracks versions on writes', () => {
    const p = new SharedScratchpad();
    p.write('g1', 'k', 'v1', 'a1');
    expect(p.getVersion('g1', 'k')).toBe(1);
    p.write('g1', 'k', 'v2', 'a2');
    expect(p.getVersion('g1', 'k')).toBe(2);
  });

  it('supports optimistic locking - rejects stale writes', () => {
    const p = new SharedScratchpad();
    p.write('g1', 'k', 'v1', 'a1');
    const ok = p.write('g1', 'k', 'v2', 'a2', 0); // wrong version
    expect(ok).toBe(false);
    expect(p.read('g1', 'k')).toBe('v1');
  });

  it('accepts write with correct version', () => {
    const p = new SharedScratchpad();
    p.write('g1', 'k', 'v1', 'a1');
    const ok = p.write('g1', 'k', 'v2', 'a2', 1); // correct version
    expect(ok).toBe(true);
    expect(p.read('g1', 'k')).toBe('v2');
  });

  it('merges with last-writer-wins strategy', () => {
    const p = new SharedScratchpad();
    p.write('g1', 'x', 'old', 'a1');
    p.merge('g1', { x: 'new', y: 10 }, 'a2');
    expect(p.read('g1', 'x')).toBe('new');
    expect(p.read('g1', 'y')).toBe(10);
  });

  it('merges with merge strategy for objects', () => {
    const p = new SharedScratchpad();
    p.setConflictResolution('merge');
    p.write('g1', 'obj', { a: 1, b: 2 }, 'a1');
    p.merge('g1', { obj: { b: 3, c: 4 } }, 'a2');
    expect(p.read('g1', 'obj')).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('creates and restores snapshots', () => {
    const p = new SharedScratchpad();
    p.write('g1', 'k1', 'v1', 'a1');
    const snapId = p.snapshot('g1');
    p.write('g1', 'k1', 'changed', 'a1');
    p.restore('g1', snapId);
    expect(p.read('g1', 'k1')).toBe('v1');
  });

  it('diffs current state against snapshot', () => {
    const p = new SharedScratchpad();
    p.write('g1', 'keep', 'same', 'a1');
    p.write('g1', 'change', 'old', 'a1');
    const snapId = p.snapshot('g1');
    // After snapshot: modify 'change', add 'added'
    p.write('g1', 'change', 'new', 'a1');
    p.write('g1', 'added', 'y', 'a1');
    const d = p.diff('g1', snapId);
    expect(d).not.toBeNull();
    expect(d!.added).toContain('added');
    expect(d!.changed).toContain('change');
    expect(d!.removed).toHaveLength(0);
  });

  it('returns history for a key', () => {
    const p = new SharedScratchpad();
    p.write('g1', 'k', 'v1', 'a1');
    p.write('g1', 'k', 'v2', 'a2');
    p.write('g1', 'k', 'v3', 'a1');
    expect(p.getHistory('g1', 'k')).toHaveLength(3);
  });
});

describe('SwarmAudit', () => {
  it('logs entries and queries by goal', () => {
    const a = new SwarmAudit();
    a.log({ goalId: 'g1', agentId: 'a1', action: 'start', timestamp: 100, detail: 'started' });
    a.log({ goalId: 'g1', agentId: 'a2', action: 'end', timestamp: 200, detail: 'ended' });
    expect(a.getByGoal('g1')).toHaveLength(2);
  });

  it('queries by agent', () => {
    const a = new SwarmAudit();
    a.log({ goalId: 'g1', agentId: 'a1', action: 'x', timestamp: 100, detail: '' });
    a.log({ goalId: 'g2', agentId: 'a1', action: 'y', timestamp: 200, detail: '' });
    expect(a.getByAgent('a1')).toHaveLength(2);
  });

  it('queries by severity', () => {
    const a = new SwarmAudit();
    a.log({
      goalId: 'g1',
      agentId: 'a1',
      action: 'x',
      timestamp: 100,
      detail: '',
      severity: 'error',
    });
    a.log({
      goalId: 'g1',
      agentId: 'a1',
      action: 'y',
      timestamp: 200,
      detail: '',
      severity: 'info',
    });
    expect(a.getBySeverity('error')).toHaveLength(1);
  });

  it('queries by time range', () => {
    const a = new SwarmAudit();
    a.log({ goalId: 'g1', agentId: 'a1', action: 'x', timestamp: 50, detail: '' });
    a.log({ goalId: 'g1', agentId: 'a1', action: 'y', timestamp: 150, detail: '' });
    a.log({ goalId: 'g1', agentId: 'a1', action: 'z', timestamp: 250, detail: '' });
    expect(a.getByTimeRange(100, 200)).toHaveLength(1);
  });

  it('replays entries in chronological order', () => {
    const a = new SwarmAudit();
    a.log({ goalId: 'g1', agentId: 'a1', action: 'z', timestamp: 300, detail: '' });
    a.log({ goalId: 'g1', agentId: 'a1', action: 'a', timestamp: 100, detail: '' });
    const replay = a.replay('g1');
    expect(replay[0]!.timestamp).toBe(100);
    expect(replay[1]!.timestamp).toBe(300);
  });

  it('exports as JSON', () => {
    const a = new SwarmAudit();
    a.log({ goalId: 'g1', agentId: 'a1', action: 'x', timestamp: 100, detail: 'test' });
    const exported = a.export();
    const parsed = JSON.parse(exported);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].detail).toBe('test');
  });

  it('supports retention policy and pruning', () => {
    const a = new SwarmAudit();
    a.setRetention(1000);
    a.log({ goalId: 'g1', agentId: 'a1', action: 'old', timestamp: Date.now() - 2000, detail: '' });
    a.log({ goalId: 'g1', agentId: 'a1', action: 'new', timestamp: Date.now(), detail: '' });
    const pruned = a.prune();
    expect(pruned).toBe(1);
    expect(a.count()).toBe(1);
  });
});
