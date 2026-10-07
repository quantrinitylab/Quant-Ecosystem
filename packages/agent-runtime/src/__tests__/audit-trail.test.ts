import { describe, it, expect } from 'vitest';
import { AuditTrail, AuditEntry } from '../audit-trail.js';

describe('AuditTrail', () => {
  function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
    return {
      id: `entry-${Date.now()}`,
      agentId: 'agent-1',
      action: 'test-action',
      timestamp: Date.now(),
      result: 'success',
      reversible: false,
      ...overrides,
    };
  }

  it('logs entries', () => {
    const trail = new AuditTrail();
    trail.log(makeEntry());
    expect(trail.getHistory()).toHaveLength(1);
  });

  it('validates entries with Zod', () => {
    const trail = new AuditTrail();
    expect(() => trail.log({ invalid: true } as unknown as AuditEntry)).toThrow();
  });

  it('retrieves history in order', () => {
    const trail = new AuditTrail();
    trail.log(makeEntry({ id: 'first', action: 'action-1' }));
    trail.log(makeEntry({ id: 'second', action: 'action-2' }));

    const history = trail.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.action).toBe('action-1');
    expect(history[1]!.action).toBe('action-2');
  });

  it('filters by agent', () => {
    const trail = new AuditTrail();
    trail.log(makeEntry({ id: 'a1', agentId: 'agent-1' }));
    trail.log(makeEntry({ id: 'a2', agentId: 'agent-2' }));
    trail.log(makeEntry({ id: 'a3', agentId: 'agent-1' }));

    const agent1Entries = trail.getByAgent('agent-1');
    expect(agent1Entries).toHaveLength(2);
    expect(agent1Entries.every((e) => e.agentId === 'agent-1')).toBe(true);
  });

  it('filters reversible actions', () => {
    const trail = new AuditTrail();
    trail.log(makeEntry({ id: 'r1', reversible: true }));
    trail.log(makeEntry({ id: 'r2', reversible: false }));
    trail.log(makeEntry({ id: 'r3', reversible: true }));

    const reversible = trail.getReversibleActions();
    expect(reversible).toHaveLength(2);
    expect(reversible.every((e) => e.reversible)).toBe(true);
  });

  it('clears all entries', () => {
    const trail = new AuditTrail();
    trail.log(makeEntry({ id: 'c1' }));
    trail.log(makeEntry({ id: 'c2' }));
    trail.clear();
    expect(trail.getHistory()).toHaveLength(0);
  });
});
