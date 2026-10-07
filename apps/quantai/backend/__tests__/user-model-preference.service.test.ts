import { describe, it, expect, beforeEach } from 'vitest';
import {
  UserModelPreferenceService,
  DEFAULT_USER_MODEL,
  type UserModelPreferencePrisma,
} from '../services/user-model-preference.service';

function createFakePrisma(): UserModelPreferencePrisma & {
  rows: Map<
    string,
    { id: string; userId: string; model: string; createdAt: Date; updatedAt: Date }
  >;
} {
  const rows = new Map<
    string,
    { id: string; userId: string; model: string; createdAt: Date; updatedAt: Date }
  >();
  return {
    rows,
    userModelPreference: {
      async findUnique(args: { where: { userId: string } }) {
        return rows.get(args.where.userId) ?? null;
      },
      async upsert(args: {
        where: { userId: string };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) {
        const existing = rows.get(args.where.userId);
        if (existing) {
          existing.model = String(args.update['model']);
          existing.updatedAt = new Date();
          return existing;
        }
        const row = {
          id: String(args.create['id'] ?? 'p1'),
          userId: String(args.create['userId']),
          model: String(args.create['model']),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rows.set(row.userId, row);
        return row;
      },
    },
  };
}

describe('UserModelPreferenceService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;

  beforeEach(() => {
    prisma = createFakePrisma();
  });

  it('returns null when no preference is stored', async () => {
    const svc = new UserModelPreferenceService(prisma as never);
    expect(await svc.getPreference('u1')).toBeNull();
  });

  it('stores and reads a preference (upsert)', async () => {
    const svc = new UserModelPreferenceService(prisma as never);
    await svc.setPreference('u1', 'anthropic/claude-3.5-sonnet');
    expect(await svc.getPreference('u1')).toBe('anthropic/claude-3.5-sonnet');
    // Second set replaces (still one row).
    await svc.setPreference('u1', 'openai/gpt-4o');
    expect(await svc.getPreference('u1')).toBe('openai/gpt-4o');
    expect(prisma.rows.size).toBe(1);
  });

  it('rejects an empty or over-long model id', async () => {
    const svc = new UserModelPreferenceService(prisma as never);
    await expect(svc.setPreference('u1', '   ')).rejects.toMatchObject({ statusCode: 400 });
    await expect(svc.setPreference('u1', 'x'.repeat(200))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('enforces an allow-list on set', async () => {
    const svc = new UserModelPreferenceService(prisma as never, {
      allowed: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
    });
    await expect(svc.setPreference('u1', 'evil/model')).rejects.toMatchObject({
      statusCode: 400,
      code: 'MODEL_NOT_ALLOWED',
    });
    await expect(svc.setPreference('u1', 'openai/gpt-4o')).resolves.toBe('openai/gpt-4o');
  });

  describe('resolve', () => {
    it('honors an explicit request model over the stored preference', async () => {
      const svc = new UserModelPreferenceService(prisma as never);
      await svc.setPreference('u1', 'openai/gpt-4o');
      const r = await svc.resolve('u1', 'anthropic/claude-3.5-sonnet');
      expect(r.model).toBe('anthropic/claude-3.5-sonnet');
    });

    it('uses the stored preference when the request pins no model', async () => {
      const svc = new UserModelPreferenceService(prisma as never);
      await svc.setPreference('u1', 'openai/gpt-4o');
      const r = await svc.resolve('u1');
      expect(r).toEqual({ model: 'openai/gpt-4o', source: 'preference' });
    });

    it('falls back to the platform default when there is no preference', async () => {
      const svc = new UserModelPreferenceService(prisma as never);
      const r = await svc.resolve('u1');
      expect(r).toEqual({ model: DEFAULT_USER_MODEL, source: 'default' });
    });

    it('falls back to default when the resolved model is not on the allow-list', async () => {
      const svc = new UserModelPreferenceService(prisma as never, {
        allowed: ['openai/gpt-4o-mini'],
        defaultModel: 'openai/gpt-4o-mini',
      });
      const r = await svc.resolve('u1', 'some/disallowed-model');
      expect(r.model).toBe('openai/gpt-4o-mini');
      expect(r.source).toBe('default');
    });
  });
});
