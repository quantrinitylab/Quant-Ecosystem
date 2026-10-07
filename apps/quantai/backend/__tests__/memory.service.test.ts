import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryService } from '../services/memory.service';

describe('MemoryService', () => {
  let service: MemoryService;

  beforeEach(() => {
    service = new MemoryService();
  });

  const createTestData = () => ({
    category: 'preferences' as const,
    content: 'User prefers dark mode',
    source: 'conversation',
    sourceApp: 'quantai',
    explanation: 'User mentioned dark mode preference',
    writeSignal: 'explicit' as const,
    accessScopes: ['quantai'],
    tags: ['ui', 'theme'],
  });

  describe('createMemory', () => {
    it('creates a memory with explicit write signal', () => {
      const data = createTestData();
      const memory = service.createMemory('user-1', data);

      expect(memory.id).toBeDefined();
      expect(memory.userId).toBe('user-1');
      expect(memory.content).toBe('User prefers dark mode');
      expect(memory.category).toBe('preferences');
      expect(memory.status).toBe('active');
      expect(memory.tags).toEqual(['ui', 'theme']);
    });

    it('throws when writeSignal is not explicit', () => {
      const data = {
        ...createTestData(),
        writeSignal: 'digest-approved' as const,
      };

      expect(() => service.createMemory('user-1', data)).toThrow('writeSignal must be "explicit"');
    });
  });

  describe('listMemories', () => {
    it('returns memories for a user', () => {
      service.createMemory('user-1', createTestData());
      service.createMemory('user-1', {
        ...createTestData(),
        category: 'skills',
        content: 'Knows TypeScript',
      });

      const memories = service.listMemories('user-1');
      expect(memories).toHaveLength(2);
    });

    it('filters by category', () => {
      service.createMemory('user-1', createTestData());
      service.createMemory('user-1', {
        ...createTestData(),
        category: 'skills',
        content: 'Knows TypeScript',
      });

      const filtered = service.listMemories('user-1', {
        category: 'preferences',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.category).toBe('preferences');
    });

    it('filters by search query', () => {
      service.createMemory('user-1', createTestData());
      service.createMemory('user-1', {
        ...createTestData(),
        content: 'Likes React',
        explanation: 'User mentioned React preference',
      });

      const filtered = service.listMemories('user-1', { search: 'dark' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.content).toContain('dark mode');
    });

    it('filters by tag', () => {
      service.createMemory('user-1', createTestData());
      service.createMemory('user-1', {
        ...createTestData(),
        content: 'Likes React',
        tags: ['frontend'],
      });

      const filtered = service.listMemories('user-1', { tag: 'ui' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.tags).toContain('ui');
    });
  });

  describe('updateMemory', () => {
    it('updates memory content', () => {
      const memory = service.createMemory('user-1', createTestData());
      const updated = service.updateMemory(memory.id, {
        content: 'Updated content',
      });

      expect(updated).toBeDefined();
      expect(updated!.content).toBe('Updated content');
    });

    it('returns undefined for non-existent id', () => {
      const result = service.updateMemory('fake-id', {
        content: 'test',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('deleteMemory', () => {
    it('deletes a memory', () => {
      const memory = service.createMemory('user-1', createTestData());
      const deleted = service.deleteMemory(memory.id);

      expect(deleted).toBe(true);
      expect(service.listMemories('user-1')).toHaveLength(0);
    });

    it('returns false for non-existent id', () => {
      expect(service.deleteMemory('fake-id')).toBe(false);
    });
  });

  describe('purgeByTag', () => {
    it('removes all memories with matching tag', () => {
      service.createMemory('user-1', createTestData());
      service.createMemory('user-1', {
        ...createTestData(),
        content: 'Another UI memory',
        tags: ['ui'],
      });
      service.createMemory('user-1', {
        ...createTestData(),
        content: 'No matching tag',
        tags: ['other'],
      });

      const purged = service.purgeByTag('user-1', 'ui');
      expect(purged).toBe(2);
      expect(service.listMemories('user-1')).toHaveLength(1);
    });
  });

  describe('candidate workflow', () => {
    it('creates a pending candidate', () => {
      const data = {
        category: 'goals' as const,
        content: 'Wants to learn Rust',
        source: 'pattern-detection',
        sourceApp: 'quantai',
        explanation: 'Mentioned Rust multiple times',
        accessScopes: ['quantai'],
        tags: ['learning'],
      };

      const candidate = service.createCandidate('user-1', data);
      expect(candidate.status).toBe('pending');
      expect(candidate.content).toBe('Wants to learn Rust');
    });

    it('getPendingCandidates returns pending items', () => {
      service.createCandidate('user-1', {
        category: 'goals' as const,
        content: 'Learn Rust',
        source: 'pattern',
        sourceApp: 'quantai',
        explanation: 'Detected pattern',
        accessScopes: [],
        tags: [],
      });

      const pending = service.getPendingCandidates('user-1');
      expect(pending).toHaveLength(1);
      expect(pending[0]!.status).toBe('pending');
    });

    it('approveCandidate transitions to active', () => {
      const candidate = service.createCandidate('user-1', {
        category: 'skills' as const,
        content: 'Knows Python',
        source: 'pattern',
        sourceApp: 'quantai',
        explanation: 'Mentioned Python',
        accessScopes: [],
        tags: [],
      });

      const approved = service.approveCandidate(candidate.id);
      expect(approved).toBeDefined();
      expect(approved!.status).toBe('active');
      expect(approved!.writeSignal).toBe('digest-approved');

      // No longer in pending
      expect(service.getPendingCandidates('user-1')).toHaveLength(0);
      // Now in active memories
      expect(service.listMemories('user-1')).toHaveLength(1);
    });

    it('rejectCandidate removes it', () => {
      const candidate = service.createCandidate('user-1', {
        category: 'routines' as const,
        content: 'Exercises daily',
        source: 'pattern',
        sourceApp: 'quantai',
        explanation: 'Detected',
        accessScopes: [],
        tags: [],
      });

      const rejected = service.rejectCandidate(candidate.id);
      expect(rejected).toBe(true);
      expect(service.getPendingCandidates('user-1')).toHaveLength(0);
    });
  });

  describe('export/import roundtrip', () => {
    it('exports memories as JSON with valid structure', () => {
      service.createMemory('user-1', createTestData());
      service.createMemory('user-1', {
        ...createTestData(),
        category: 'skills',
        content: 'Knows TypeScript',
      });

      const exported = service.exportMemories('user-1', 'json');
      const parsed = JSON.parse(exported) as {
        version: string;
        entries: Array<{ userId?: string }>;
      };
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.entries).toHaveLength(2);
    });

    it('imports memories from valid JSON', () => {
      const importData = JSON.stringify({
        version: '1.0.0',
        exportedAt: Date.now(),
        userId: 'user-1',
        entries: [
          {
            id: 'mem_old_1',
            userId: 'user-1',
            category: 'people',
            content: 'Imported person fact',
            source: 'import',
            sourceApp: 'quantdocs',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            accessLog: [],
            explanation: 'Imported from backup',
            accessScopes: ['*'],
            writeSignal: 'explicit',
            status: 'active',
            tags: ['imported'],
          },
        ],
      });

      const imported = service.importMemories('user-1', importData);
      expect(imported).toHaveLength(1);
      expect(imported[0]!.content).toBe('Imported person fact');
    });

    it('exports as markdown', () => {
      service.createMemory('user-1', createTestData());
      const md = service.exportMemories('user-1', 'markdown');
      expect(md).toContain('# AI Memory Export');
      expect(md).toContain('dark mode');
    });

    it('exports as csv', () => {
      service.createMemory('user-1', createTestData());
      const csv = service.exportMemories('user-1', 'csv');
      expect(csv).toContain('id,userId,category');
      expect(csv).toContain('dark mode');
    });
  });

  describe('ownership enforcement (getMemory for route-level checks)', () => {
    it('getMemory returns entry with userId so routes can verify ownership', () => {
      const memory = service.createMemory('user-1', createTestData());
      const fetched = service.getMemory(memory.id);

      expect(fetched).toBeDefined();
      expect(fetched!.userId).toBe('user-1');
      // Routes use this to enforce: if (existing.userId !== requestUserId) throw 403
    });

    it('getMemory returns undefined for non-existent id', () => {
      const fetched = service.getMemory('non-existent-id');
      expect(fetched).toBeUndefined();
    });

    it('getMemory returns entry regardless of status (active or pending)', () => {
      const candidate = service.createCandidate('user-1', {
        category: 'goals' as const,
        content: 'Learn Go',
        source: 'pattern',
        sourceApp: 'quantai',
        explanation: 'Detected',
        accessScopes: [],
        tags: [],
      });

      const fetched = service.getMemory(candidate.id);
      expect(fetched).toBeDefined();
      expect(fetched!.status).toBe('pending');
      expect(fetched!.userId).toBe('user-1');
    });
  });

  describe('getFullDisclosure', () => {
    it('returns all memories with access logs', () => {
      service.createMemory('user-1', createTestData());
      const disclosure = service.getFullDisclosure('user-1');

      expect(disclosure.memories).toHaveLength(1);
      expect(disclosure.accessLogs).toHaveLength(1);
      expect(disclosure.accessLogs[0]!.content).toBe('User prefers dark mode');
      expect(disclosure.accessLogs[0]!.logs).toEqual([]);
    });
  });
});
