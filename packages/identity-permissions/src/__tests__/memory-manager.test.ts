import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryManager } from '../core/memory-manager.js';

describe('MemoryManager', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager();
  });

  describe('addMemory', () => {
    it('adds a memory entry', () => {
      const entry = manager.addMemory('user-1', 'quantchat', 'Prefers dark mode');
      expect(entry).not.toBeNull();
      expect(entry?.userId).toBe('user-1');
      expect(entry?.appSource).toBe('quantchat');
      expect(entry?.content).toBe('Prefers dark mode');
      expect(entry?.paused).toBe(false);
    });

    it('returns null if app memory is disabled', () => {
      manager.setAppMemoryEnabled('user-1', 'quantchat', false);
      const entry = manager.addMemory('user-1', 'quantchat', 'Test');
      expect(entry).toBeNull();
    });
  });

  describe('getMemories', () => {
    it('returns all memories for a user', () => {
      manager.addMemory('user-1', 'quantchat', 'Memory 1');
      manager.addMemory('user-1', 'quantmail', 'Memory 2');
      manager.addMemory('user-2', 'quantchat', 'Memory 3');

      const memories = manager.getMemories('user-1');
      expect(memories).toHaveLength(2);
    });

    it('filters by appSource', () => {
      manager.addMemory('user-1', 'quantchat', 'Memory 1');
      manager.addMemory('user-1', 'quantmail', 'Memory 2');

      const memories = manager.getMemories('user-1', 'quantchat');
      expect(memories).toHaveLength(1);
      expect(memories[0]?.appSource).toBe('quantchat');
    });
  });

  describe('editMemory', () => {
    it('updates memory content', () => {
      const entry = manager.addMemory('user-1', 'quantchat', 'Original');
      expect(entry).not.toBeNull();
      expect(manager.editMemory(entry!.id, 'Updated')).toBe(true);

      const memories = manager.getMemories('user-1');
      expect(memories[0]?.content).toBe('Updated');
    });

    it('returns false for unknown id', () => {
      expect(manager.editMemory('unknown', 'data')).toBe(false);
    });
  });

  describe('deleteMemory', () => {
    it('removes a memory entry', () => {
      const entry = manager.addMemory('user-1', 'quantchat', 'Test');
      expect(entry).not.toBeNull();
      expect(manager.deleteMemory(entry!.id)).toBe(true);
      expect(manager.getMemories('user-1')).toHaveLength(0);
    });

    it('returns false for unknown id', () => {
      expect(manager.deleteMemory('unknown')).toBe(false);
    });
  });

  describe('pause/resume', () => {
    it('pauses a memory', () => {
      const entry = manager.addMemory('user-1', 'quantchat', 'Test');
      expect(entry).not.toBeNull();
      expect(manager.pauseMemory(entry!.id)).toBe(true);

      const memories = manager.getMemories('user-1');
      expect(memories[0]?.paused).toBe(true);
    });

    it('resumes a paused memory', () => {
      const entry = manager.addMemory('user-1', 'quantchat', 'Test');
      expect(entry).not.toBeNull();
      manager.pauseMemory(entry!.id);
      expect(manager.resumeMemory(entry!.id)).toBe(true);

      const memories = manager.getMemories('user-1');
      expect(memories[0]?.paused).toBe(false);
    });
  });

  describe('per-app controls', () => {
    it('disabling app memory prevents new memories', () => {
      manager.setAppMemoryEnabled('user-1', 'quantchat', false);
      expect(manager.addMemory('user-1', 'quantchat', 'Test')).toBeNull();
    });

    it('enabling app memory allows new memories', () => {
      manager.setAppMemoryEnabled('user-1', 'quantchat', false);
      manager.setAppMemoryEnabled('user-1', 'quantchat', true);
      expect(manager.addMemory('user-1', 'quantchat', 'Test')).not.toBeNull();
    });

    it('defaults to enabled', () => {
      expect(manager.isAppMemoryEnabled('user-1', 'quantchat')).toBe(true);
    });
  });

  describe('getActiveMemories', () => {
    it('returns only non-paused memories', () => {
      const entry1 = manager.addMemory('user-1', 'quantchat', 'Active');
      const entry2 = manager.addMemory('user-1', 'quantchat', 'Paused');
      expect(entry1).not.toBeNull();
      expect(entry2).not.toBeNull();
      manager.pauseMemory(entry2!.id);

      const active = manager.getActiveMemories('user-1');
      expect(active).toHaveLength(1);
      expect(active[0]?.content).toBe('Active');
    });
  });
});
