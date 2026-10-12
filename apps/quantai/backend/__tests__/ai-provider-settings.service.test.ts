import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock server-core: the real module's import chain reaches @quant/database,
// whose Prisma client is not generated in this environment (pre-existing;
// the unmocked user-model-preference.service.test.ts fails the same way).
// Only createAppError is needed here.
vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

import {
  AiProviderSettingsService,
  DEFAULT_PROVIDER_ORDER,
  validateProviderOrder,
  type AiProviderSettingsPrisma,
} from '../services/ai-provider-settings.service';

function makeMockPrisma() {
  const store = new Map<string, any>();
  const calls = { findUnique: 0, upsert: 0 };
  const prisma: AiProviderSettingsPrisma = {
    aiProviderSettings: {
      findUnique: async ({ where }: { where: { scope: string } }) => {
        calls.findUnique += 1;
        return store.get(where.scope) ?? null;
      },
      upsert: async ({ where, update, create }: any) => {
        calls.upsert += 1;
        const existing = store.get(where.scope);
        const row = existing
          ? { ...existing, ...update, updatedAt: new Date('2026-10-11T00:00:01Z') }
          : {
              ...create,
              createdAt: new Date('2026-10-11T00:00:00Z'),
              updatedAt: new Date('2026-10-11T00:00:00Z'),
            };
        store.set(where.scope, row);
        return row;
      },
    },
  };
  return { prisma, store, calls };
}

describe('validateProviderOrder', () => {
  it('accepts a valid permutation subset', () => {
    expect(() => validateProviderOrder(['meta', 'openai'])).not.toThrow();
    expect(() =>
      validateProviderOrder(['meta', 'openai', 'anthropic', 'google', 'openrouter']),
    ).not.toThrow();
  });

  it('rejects empty and non-array input with 400', () => {
    for (const bad of [[], null, undefined, 'meta', 42, {}]) {
      try {
        validateProviderOrder(bad);
        expect.unreachable(`should have thrown for ${JSON.stringify(bad)}`);
      } catch (e: any) {
        expect(e.statusCode).toBe(400);
        expect(e.code).toBe('INVALID_PROVIDER_ORDER');
      }
    }
  });

  it('rejects unknown provider ids with 400', () => {
    try {
      validateProviderOrder(['meta', 'skynet']);
      expect.unreachable();
    } catch (e: any) {
      expect(e.statusCode).toBe(400);
      expect(e.code).toBe('UNKNOWN_PROVIDER');
      expect(String(e.message)).toContain('skynet');
    }
  });

  it('rejects duplicate provider ids with 400', () => {
    try {
      validateProviderOrder(['meta', 'meta']);
      expect.unreachable();
    } catch (e: any) {
      expect(e.statusCode).toBe(400);
      expect(e.code).toBe('DUPLICATE_PROVIDER');
    }
  });
});

describe('AiProviderSettingsService', () => {
  let mock: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    mock = makeMockPrisma();
  });

  it('returns the compiled default when no row exists', async () => {
    const svc = new AiProviderSettingsService(mock.prisma);
    await expect(svc.getProviderOrder()).resolves.toEqual(DEFAULT_PROVIDER_ORDER);
  });

  it('round-trips a valid order through set + get', async () => {
    const svc = new AiProviderSettingsService(mock.prisma);
    const updated = await svc.setProviderOrder(['openai', 'meta'], 'admin-1');
    expect(updated.order).toEqual(['openai', 'meta']);
    expect(updated.updatedBy).toBe('admin-1');
    await expect(svc.getProviderOrder()).resolves.toEqual(['openai', 'meta']);
  });

  it('setProviderOrder rejects invalid orders without touching the DB', async () => {
    const svc = new AiProviderSettingsService(mock.prisma);
    await expect(svc.setProviderOrder(['nope'] as string[], 'admin-1')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mock.calls.upsert).toBe(0);
  });

  it('caches reads within the TTL and invalidates on write', async () => {
    const svc = new AiProviderSettingsService(mock.prisma, { cacheTtlMs: 60_000 });
    await svc.getProviderOrder();
    await svc.getProviderOrder();
    expect(mock.calls.findUnique).toBe(1);

    await svc.setProviderOrder(['google', 'meta'], 'admin-2');
    await svc.getProviderOrder();
    expect(mock.calls.findUnique).toBe(2);
    await expect(svc.getProviderOrder()).resolves.toEqual(['google', 'meta']);
  });

  it('fails open to the default when the DB throws', async () => {
    const errors: unknown[] = [];
    const failing: AiProviderSettingsPrisma = {
      aiProviderSettings: {
        findUnique: async () => {
          throw new Error('db down');
        },
        upsert: async () => {
          throw new Error('db down');
        },
      },
    };
    const svc = new AiProviderSettingsService(failing, { onError: (e) => errors.push(e) });
    await expect(svc.getProviderOrder()).resolves.toEqual(DEFAULT_PROVIDER_ORDER);
    expect(errors).toHaveLength(1);
  });

  it('fails open when prisma is absent', async () => {
    const svc = new AiProviderSettingsService(null);
    await expect(svc.getProviderOrder()).resolves.toEqual(DEFAULT_PROVIDER_ORDER);
    await expect(svc.setProviderOrder(['meta'], 'admin-1')).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('treats a corrupt stored row as the default order', async () => {
    mock.store.set('global', {
      id: 'x',
      scope: 'global',
      providerOrder: ['meta', 'skynet', 'meta'],
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const svc = new AiProviderSettingsService(mock.prisma);
    // 'skynet' is dropped defensively; valid entries survive.
    await expect(svc.getProviderOrder()).resolves.toEqual(['meta']);

    mock.store.set('global', {
      id: 'x',
      scope: 'global',
      providerOrder: 'not-an-array',
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    svc.invalidateCache();
    await expect(svc.getProviderOrder()).resolves.toEqual(DEFAULT_PROVIDER_ORDER);
  });

  it('getStatus reports order and availability without secrets', async () => {
    const svc = new AiProviderSettingsService(mock.prisma);
    const status = await svc.getStatus();
    expect(status.order).toEqual(DEFAULT_PROVIDER_ORDER);
    expect(status.providers.map((p) => p.id)).toEqual([
      'meta',
      'openai',
      'anthropic',
      'google',
      'openrouter',
    ]);
    for (const p of status.providers) {
      expect(typeof p.available).toBe('boolean');
      expect(p).not.toHaveProperty('apiKey');
      expect(JSON.stringify(p)).not.toMatch(/sk-|key/i);
    }
  });
});
