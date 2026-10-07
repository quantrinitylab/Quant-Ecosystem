import { describe, it, expect } from 'vitest';
import { ConflictResolver } from '../conflict-resolver.js';

describe('ConflictResolver', () => {
  it('acquires lock on free resource', () => {
    const resolver = new ConflictResolver();
    const acquired = resolver.acquireLock('file.txt', 'agent-1');
    expect(acquired).toBe(true);
    expect(resolver.isLocked('file.txt')).toBe(true);
  });

  it('blocks lock acquisition by another agent', () => {
    const resolver = new ConflictResolver();
    resolver.acquireLock('file.txt', 'agent-1');
    const acquired = resolver.acquireLock('file.txt', 'agent-2');
    expect(acquired).toBe(false);
  });

  it('allows same agent to re-acquire lock', () => {
    const resolver = new ConflictResolver();
    resolver.acquireLock('file.txt', 'agent-1');
    const acquired = resolver.acquireLock('file.txt', 'agent-1');
    expect(acquired).toBe(true);
  });

  it('releases lock', () => {
    const resolver = new ConflictResolver();
    resolver.acquireLock('file.txt', 'agent-1');
    const released = resolver.releaseLock('file.txt', 'agent-1');
    expect(released).toBe(true);
    expect(resolver.isLocked('file.txt')).toBe(false);
  });

  it('rejects release from wrong agent', () => {
    const resolver = new ConflictResolver();
    resolver.acquireLock('file.txt', 'agent-1');
    const released = resolver.releaseLock('file.txt', 'agent-2');
    expect(released).toBe(false);
    expect(resolver.isLocked('file.txt')).toBe(true);
  });

  it('resolves conflict with first-come-first-served', () => {
    const resolver = new ConflictResolver();
    resolver.acquireLock('file.txt', 'agent-1');

    const result = resolver.resolveConflict('file.txt', ['agent-1', 'agent-2']);
    expect(result.resolved).toBe(true);
    expect(result.winner).toBe('agent-1');
    expect(result.loser).toBe('agent-2');
  });

  it('resolves conflict when second agent holds lock', () => {
    const resolver = new ConflictResolver();
    resolver.acquireLock('file.txt', 'agent-2');

    const result = resolver.resolveConflict('file.txt', ['agent-1', 'agent-2']);
    expect(result.resolved).toBe(true);
    expect(result.winner).toBe('agent-2');
    expect(result.loser).toBe('agent-1');
  });

  it('returns lock holder', () => {
    const resolver = new ConflictResolver();
    resolver.acquireLock('file.txt', 'agent-1');
    expect(resolver.getLockHolder('file.txt')).toBe('agent-1');
  });

  it('returns undefined for unlocked resource', () => {
    const resolver = new ConflictResolver();
    expect(resolver.getLockHolder('file.txt')).toBeUndefined();
  });

  it('reports active locks', () => {
    const resolver = new ConflictResolver();
    resolver.acquireLock('file1.txt', 'agent-1');
    resolver.acquireLock('file2.txt', 'agent-2');
    expect(resolver.getActiveLocks()).toHaveLength(2);
  });
});
