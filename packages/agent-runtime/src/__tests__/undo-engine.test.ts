import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UndoEngine } from '../undo-engine.js';

describe('UndoEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers and undoes an action', async () => {
    const engine = new UndoEngine();
    const undoFn = vi.fn().mockResolvedValue(undefined);

    engine.registerAction('action-1', undoFn);
    expect(engine.canUndo('action-1')).toBe(true);

    await engine.undo('action-1');
    expect(undoFn).toHaveBeenCalledOnce();
    expect(engine.canUndo('action-1')).toBe(false);
  });

  it('lists undoable actions', () => {
    const engine = new UndoEngine();
    engine.registerAction('a1', vi.fn().mockResolvedValue(undefined));
    engine.registerAction('a2', vi.fn().mockResolvedValue(undefined));

    const actions = engine.getUndoableActions();
    expect(actions).toContain('a1');
    expect(actions).toContain('a2');
  });

  it('has a default TTL of 24 hours', () => {
    const engine = new UndoEngine();
    engine.registerAction('action-1', vi.fn().mockResolvedValue(undefined));

    // Still valid after 23 hours
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    expect(engine.canUndo('action-1')).toBe(true);

    // Expired after 24 hours
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(engine.canUndo('action-1')).toBe(false);
  });

  it('expires actions after custom TTL', () => {
    const engine = new UndoEngine(5 * 60 * 1000); // 5 min TTL
    engine.registerAction('action-1', vi.fn().mockResolvedValue(undefined));

    expect(engine.canUndo('action-1')).toBe(true);

    // Advance time past TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    expect(engine.canUndo('action-1')).toBe(false);
  });

  it('throws when undoing expired action', async () => {
    const engine = new UndoEngine(5 * 60 * 1000);
    engine.registerAction('action-1', vi.fn().mockResolvedValue(undefined));

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await expect(engine.undo('action-1')).rejects.toThrow(/expired/);
  });

  it('throws when undoing non-existent action', async () => {
    const engine = new UndoEngine();
    await expect(engine.undo('nonexistent')).rejects.toThrow(/not found/);
  });

  it('prunes expired actions', () => {
    const engine = new UndoEngine(5 * 60 * 1000);
    engine.registerAction('a1', vi.fn().mockResolvedValue(undefined));

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    engine.prune();
    expect(engine.getUndoableActions()).toHaveLength(0);
  });

  it('keeps actions within TTL after prune', () => {
    const engine = new UndoEngine(5 * 60 * 1000);
    engine.registerAction('a1', vi.fn().mockResolvedValue(undefined));

    vi.advanceTimersByTime(2 * 60 * 1000); // Only 2 minutes

    engine.prune();
    expect(engine.getUndoableActions()).toHaveLength(1);
  });

  describe('registerMutation', () => {
    it('registers a mutation with full metadata', () => {
      const engine = new UndoEngine();
      const undoFn = vi.fn().mockResolvedValue(undefined);

      engine.registerMutation('m1', 'agent-1', 'email', 'Deleted email', ['email-123'], undoFn);
      expect(engine.canUndo('m1')).toBe(true);
    });

    it('mutation can be undone', async () => {
      const engine = new UndoEngine();
      const undoFn = vi.fn().mockResolvedValue(undefined);

      engine.registerMutation('m1', 'agent-1', 'calendar', 'Moved meeting', ['event-1'], undoFn);
      await engine.undo('m1');
      expect(undoFn).toHaveBeenCalledOnce();
    });

    it('registerAction still works with default empty metadata', () => {
      const engine = new UndoEngine();
      const undoFn = vi.fn().mockResolvedValue(undefined);

      engine.registerAction('a1', undoFn);
      const byAgent = engine.getUndoableByAgent('');
      expect(byAgent).toHaveLength(1);
      expect(byAgent[0]!.agentId).toBe('');
      expect(byAgent[0]!.app).toBe('');
      expect(byAgent[0]!.description).toBe('');
      expect(byAgent[0]!.affectedResources).toEqual([]);
    });
  });

  describe('getUndoableByAgent', () => {
    it('filters actions by agentId', () => {
      const engine = new UndoEngine();
      engine.registerMutation(
        'm1',
        'agent-1',
        'email',
        'action 1',
        [],
        vi.fn().mockResolvedValue(undefined),
      );
      engine.registerMutation(
        'm2',
        'agent-2',
        'calendar',
        'action 2',
        [],
        vi.fn().mockResolvedValue(undefined),
      );
      engine.registerMutation(
        'm3',
        'agent-1',
        'files',
        'action 3',
        [],
        vi.fn().mockResolvedValue(undefined),
      );

      const agent1Actions = engine.getUndoableByAgent('agent-1');
      expect(agent1Actions).toHaveLength(2);
      expect(agent1Actions.map((a) => a.id)).toEqual(['m1', 'm3']);
    });

    it('returns empty array for unknown agent', () => {
      const engine = new UndoEngine();
      engine.registerMutation(
        'm1',
        'agent-1',
        'email',
        'action 1',
        [],
        vi.fn().mockResolvedValue(undefined),
      );
      expect(engine.getUndoableByAgent('agent-99')).toHaveLength(0);
    });
  });

  describe('getUndoableByApp', () => {
    it('filters actions by app', () => {
      const engine = new UndoEngine();
      engine.registerMutation(
        'm1',
        'agent-1',
        'email',
        'action 1',
        [],
        vi.fn().mockResolvedValue(undefined),
      );
      engine.registerMutation(
        'm2',
        'agent-2',
        'calendar',
        'action 2',
        [],
        vi.fn().mockResolvedValue(undefined),
      );
      engine.registerMutation(
        'm3',
        'agent-1',
        'email',
        'action 3',
        [],
        vi.fn().mockResolvedValue(undefined),
      );

      const emailActions = engine.getUndoableByApp('email');
      expect(emailActions).toHaveLength(2);
      expect(emailActions.map((a) => a.id)).toEqual(['m1', 'm3']);
    });

    it('returns empty array for unknown app', () => {
      const engine = new UndoEngine();
      engine.registerMutation(
        'm1',
        'agent-1',
        'email',
        'action 1',
        [],
        vi.fn().mockResolvedValue(undefined),
      );
      expect(engine.getUndoableByApp('unknown-app')).toHaveLength(0);
    });
  });

  describe('undoAll', () => {
    it('reverts all actions by a specific agent', async () => {
      const engine = new UndoEngine();
      const undoFn1 = vi.fn().mockResolvedValue(undefined);
      const undoFn2 = vi.fn().mockResolvedValue(undefined);
      const undoFn3 = vi.fn().mockResolvedValue(undefined);

      engine.registerMutation('m1', 'agent-1', 'email', 'action 1', [], undoFn1);
      engine.registerMutation('m2', 'agent-2', 'calendar', 'action 2', [], undoFn2);
      engine.registerMutation('m3', 'agent-1', 'files', 'action 3', [], undoFn3);

      await engine.undoAll('agent-1');

      expect(undoFn1).toHaveBeenCalledOnce();
      expect(undoFn2).not.toHaveBeenCalled();
      expect(undoFn3).toHaveBeenCalledOnce();
    });

    it('removes undone actions from the engine', async () => {
      const engine = new UndoEngine();
      engine.registerMutation(
        'm1',
        'agent-1',
        'email',
        'action 1',
        [],
        vi.fn().mockResolvedValue(undefined),
      );
      engine.registerMutation(
        'm2',
        'agent-1',
        'calendar',
        'action 2',
        [],
        vi.fn().mockResolvedValue(undefined),
      );

      await engine.undoAll('agent-1');

      expect(engine.getUndoableByAgent('agent-1')).toHaveLength(0);
      expect(engine.getUndoableActions()).toHaveLength(0);
    });

    it('does nothing for unknown agent', async () => {
      const engine = new UndoEngine();
      engine.registerMutation(
        'm1',
        'agent-1',
        'email',
        'action 1',
        [],
        vi.fn().mockResolvedValue(undefined),
      );

      await engine.undoAll('agent-99');

      expect(engine.getUndoableActions()).toHaveLength(1);
    });
  });
});
