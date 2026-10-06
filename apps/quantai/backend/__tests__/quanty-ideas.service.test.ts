import { describe, it, expect, beforeEach } from 'vitest';
import {
  IdeasService,
  type IdeasPrismaClient,
  type QuantyIdeaRow,
} from '../services/quanty-ideas.service';

// ---------------------------------------------------------------------------
// In-memory fake of the structural Prisma slice used by IdeasService.
// ---------------------------------------------------------------------------

function createFakePrisma(): IdeasPrismaClient & { _rows: Map<string, QuantyIdeaRow> } {
  const rows = new Map<string, QuantyIdeaRow>();
  let seq = 0;

  return {
    _rows: rows,
    quantyIdea: {
      async findMany(args: { where: { userId: string; status?: string } }) {
        const { userId, status } = args.where;
        return [...rows.values()]
          .filter((r) => r.userId === userId && (!status || r.status === status))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      },
      async findUnique(args: { where: { id: string } }) {
        return rows.get(args.where.id) ?? null;
      },
      async create(args: {
        data: { userId: string; title: string; description: string; emoji: string; status: string };
      }) {
        seq += 1;
        const now = new Date(Date.now() + seq); // distinct timestamps for ordering
        const row: QuantyIdeaRow = { id: `idea_${seq}`, createdAt: now, updatedAt: now, ...args.data };
        rows.set(row.id, row);
        return row;
      },
      async update(args: {
        where: { id: string };
        data: Partial<Pick<QuantyIdeaRow, 'title' | 'description' | 'emoji' | 'status'>>;
      }) {
        const existing = rows.get(args.where.id);
        if (!existing) throw new Error('not found');
        const updated = { ...existing, ...args.data, updatedAt: new Date() };
        rows.set(updated.id, updated);
        return updated;
      },
      async delete(args: { where: { id: string } }) {
        const existing = rows.get(args.where.id);
        if (!existing) throw new Error('not found');
        rows.delete(args.where.id);
        return existing;
      },
    },
  };
}

function appErrorOf(e: unknown): { statusCode?: number; code?: string } {
  return e as { statusCode?: number; code?: string };
}

describe('IdeasService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let service: IdeasService;
  const alice = 'user_alice';
  const bob = 'user_bob';

  beforeEach(() => {
    prisma = createFakePrisma();
    service = new IdeasService(prisma);
  });

  it('creates ideas with status "new" and honest defaults', async () => {
    const idea = await service.create(alice, { title: 'Triage my inbox' });
    expect(idea.status).toBe('new');
    expect(idea.emoji).toBe('💡');
    expect(idea.description).toBe('');
    expect(idea.userId).toBe(alice);
  });

  it('lists newest first and only the requesting user\'s ideas', async () => {
    await service.create(alice, { title: 'First' });
    await service.create(bob, { title: 'Bob idea' });
    await service.create(alice, { title: 'Second' });

    const rows = await service.list(alice);
    expect(rows.map((r) => r.title)).toEqual(['Second', 'First']);
  });

  it('returns an honest empty list when the user has no ideas', async () => {
    expect(await service.list(alice)).toEqual([]);
  });

  it('filters by status', async () => {
    const a = await service.create(alice, { title: 'A' });
    await service.create(alice, { title: 'B' });
    await service.setStatus(a.id, alice, 'saved');

    expect((await service.list(alice, 'new')).map((r) => r.title)).toEqual(['B']);
    expect((await service.list(alice, 'saved')).map((r) => r.title)).toEqual(['A']);
    expect(await service.list(alice, 'dismissed')).toEqual([]);
  });

  it('get returns the idea for its owner', async () => {
    const created = await service.create(alice, { title: 'Hello' });
    const fetched = await service.get(created.id, alice);
    expect(fetched.id).toBe(created.id);
  });

  it('get throws 404 for a missing id (no fabrication)', async () => {
    const err = await service.get('nope', alice).catch((e) => e);
    expect(appErrorOf(err).statusCode).toBe(404);
    expect(appErrorOf(err).code).toBe('IDEA_NOT_FOUND');
  });

  it('get throws 404 when the idea belongs to another user (no existence leak)', async () => {
    const created = await service.create(alice, { title: 'Private' });
    const err = await service.get(created.id, bob).catch((e) => e);
    expect(appErrorOf(err).statusCode).toBe(404);
  });

  it('update edits fields for the owner', async () => {
    const created = await service.create(alice, { title: 'Old' });
    const updated = await service.update(created.id, alice, { title: 'New', emoji: '🚀' });
    expect(updated.title).toBe('New');
    expect(updated.emoji).toBe('🚀');
  });

  it('update throws 404 for another user\'s idea and does not mutate it', async () => {
    const created = await service.create(alice, { title: 'Untouched' });
    const err = await service.update(created.id, bob, { title: 'Hacked' }).catch((e) => e);
    expect(appErrorOf(err).statusCode).toBe(404);
    expect((await service.get(created.id, alice)).title).toBe('Untouched');
  });

  it('setStatus transitions new -> saved -> dismissed -> new', async () => {
    const created = await service.create(alice, { title: 'Cycle' });
    expect((await service.setStatus(created.id, alice, 'saved')).status).toBe('saved');
    expect((await service.setStatus(created.id, alice, 'dismissed')).status).toBe('dismissed');
    expect((await service.setStatus(created.id, alice, 'new')).status).toBe('new');
  });

  it('setStatus throws 404 for another user\'s idea', async () => {
    const created = await service.create(alice, { title: 'Mine' });
    const err = await service.setStatus(created.id, bob, 'dismissed').catch((e) => e);
    expect(appErrorOf(err).statusCode).toBe(404);
    expect((await service.get(created.id, alice)).status).toBe('new');
  });

  it('remove deletes the owner\'s idea', async () => {
    const created = await service.create(alice, { title: 'Gone' });
    await service.remove(created.id, alice);
    expect(await service.list(alice)).toEqual([]);
  });

  it('remove throws 404 for another user\'s idea and keeps it', async () => {
    const created = await service.create(alice, { title: 'Stays' });
    const err = await service.remove(created.id, bob).catch((e) => e);
    expect(appErrorOf(err).statusCode).toBe(404);
    expect((await service.list(alice)).map((r) => r.id)).toEqual([created.id]);
  });
});
