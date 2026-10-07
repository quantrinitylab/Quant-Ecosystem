import { describe, it, expect, beforeEach } from 'vitest';
import {
  PromptTemplateService,
  type PromptTemplatePrismaClient,
} from '../services/prompt-template.service';

// In-memory fake of the Prisma slice the service uses, preserving real
// semantics (durable across calls, ownership by userId) so tests exercise the
// actual service logic.
function createFakePrisma(): PromptTemplatePrismaClient {
  const rows: Array<Record<string, unknown>> = [];
  let seq = 0;

  function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([k, v]) => row[k] === v);
  }

  return {
    aiPromptTemplate: {
      findMany: async (args) => {
        const where = (args?.['where'] as Record<string, unknown>) ?? {};
        return rows.filter((r) => matches(r, where)) as never;
      },
      findUnique: async ({ where }) => (rows.find((r) => r['id'] === where.id) as never) ?? null,
      create: async ({ data }) => {
        const now = new Date();
        const row = {
          id: `prompt-${++seq}`,
          tags: [],
          category: 'general',
          isFavorite: false,
          usageCount: 0,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        rows.push(row);
        return row as never;
      },
      update: async ({ where, data }) => {
        const row = rows.find((r) => r['id'] === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return row as never;
      },
      delete: async ({ where }) => {
        const idx = rows.findIndex((r) => r['id'] === where.id);
        if (idx >= 0) rows.splice(idx, 1);
        return {} as never;
      },
    },
  };
}

const USER = 'user-1';

describe('PromptTemplateService', () => {
  let service: PromptTemplateService;

  beforeEach(() => {
    service = new PromptTemplateService(createFakePrisma());
  });

  describe('create', () => {
    it('creates a prompt with defaults', async () => {
      const p = await service.create(USER, { title: 'Review', content: 'Review this code' });
      expect(p.id).toBeDefined();
      expect(p.title).toBe('Review');
      expect(p.category).toBe('general');
      expect(p.usageCount).toBe(0);
      expect(p.isFavorite).toBe(false);
    });

    it('normalizes and de-duplicates tags', async () => {
      const p = await service.create(USER, {
        title: 'T',
        content: 'C',
        tags: [' a ', 'b', 'a', '', 'b'],
      });
      expect(p.tags).toEqual(['a', 'b']);
    });

    it('rejects empty title or content', async () => {
      await expect(service.create(USER, { title: '', content: 'x' })).rejects.toThrow();
      await expect(service.create(USER, { title: 'x', content: '   ' })).rejects.toThrow();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await service.create(USER, {
        title: 'Email Writer',
        content: 'Write an email',
        category: 'writing',
        tags: ['email'],
      });
      await service.create(USER, {
        title: 'Code Helper',
        content: 'Help with python',
        category: 'coding',
        tags: ['python'],
      });
    });

    it('returns all prompts for the user', async () => {
      const all = await service.list(USER);
      expect(all).toHaveLength(2);
    });

    it('filters by category', async () => {
      const coding = await service.list(USER, { category: 'coding' });
      expect(coding).toHaveLength(1);
      expect(coding[0]?.title).toBe('Code Helper');
    });

    it('searches title, content, and tags', async () => {
      expect(await service.list(USER, { search: 'email' })).toHaveLength(1);
      expect(await service.list(USER, { search: 'python' })).toHaveLength(1);
      expect(await service.list(USER, { search: 'nonexistent' })).toHaveLength(0);
    });

    it('does not leak other users prompts', async () => {
      await service.create('other-user', { title: 'Secret', content: 'hidden' });
      const mine = await service.list(USER);
      expect(mine).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('updates fields', async () => {
      const p = await service.create(USER, { title: 'Old', content: 'C' });
      const updated = await service.update(p.id, USER, { title: 'New', category: 'coding' });
      expect(updated.title).toBe('New');
      expect(updated.category).toBe('coding');
    });

    it('rejects updates from a different user', async () => {
      const p = await service.create(USER, { title: 'Mine', content: 'C' });
      await expect(service.update(p.id, 'intruder', { title: 'Hacked' })).rejects.toThrow();
    });

    it('throws for a missing prompt', async () => {
      await expect(service.update('nope', USER, { title: 'X' })).rejects.toThrow();
    });
  });

  describe('toggleFavorite', () => {
    it('flips favorite state', async () => {
      const p = await service.create(USER, { title: 'T', content: 'C' });
      const fav = await service.toggleFavorite(p.id, USER);
      expect(fav.isFavorite).toBe(true);
      const unfav = await service.toggleFavorite(p.id, USER);
      expect(unfav.isFavorite).toBe(false);
    });
  });

  describe('recordUsage', () => {
    it('increments usage count', async () => {
      const p = await service.create(USER, { title: 'T', content: 'C' });
      await service.recordUsage(p.id, USER);
      const after = await service.recordUsage(p.id, USER);
      expect(after.usageCount).toBe(2);
    });
  });

  describe('delete', () => {
    it('removes an owned prompt', async () => {
      const p = await service.create(USER, { title: 'T', content: 'C' });
      await service.delete(p.id, USER);
      expect(await service.list(USER)).toHaveLength(0);
    });

    it('rejects deleting another users prompt', async () => {
      const p = await service.create(USER, { title: 'T', content: 'C' });
      await expect(service.delete(p.id, 'intruder')).rejects.toThrow();
    });
  });

  describe('getCategories', () => {
    it('returns sorted distinct categories', async () => {
      await service.create(USER, { title: 'A', content: 'C', category: 'writing' });
      await service.create(USER, { title: 'B', content: 'C', category: 'coding' });
      await service.create(USER, { title: 'C', content: 'C', category: 'coding' });
      expect(await service.getCategories(USER)).toEqual(['coding', 'writing']);
    });
  });
});
