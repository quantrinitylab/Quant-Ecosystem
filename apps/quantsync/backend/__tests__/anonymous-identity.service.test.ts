import { describe, it, expect, vi } from 'vitest';
import { AnonymousIdentityService } from '../services/anonymous-identity.service';
import type { PrismaClient } from '../types';

function mockPrisma() {
  const store: Record<string, { ghostMode?: boolean }> = {};
  const prisma = {
    user: {
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: { ghostMode: boolean } }) => {
          store[where.id] = { ghostMode: data.ghostMode };
          return store[where.id];
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => store[where.id] ?? null),
    },
    post: {} as never,
    like: {} as never,
    community: {} as never,
    communityMember: {} as never,
    userRelationship: {} as never,
  } as unknown as PrismaClient;
  return { prisma, store };
}

describe('AnonymousIdentityService', () => {
  it('requires an alias secret', () => {
    expect(() => new AnonymousIdentityService(mockPrisma().prisma, '')).toThrow();
  });

  it('enabling ghost mode persists and returns an alias', async () => {
    const { prisma, store } = mockPrisma();
    const svc = new AnonymousIdentityService(prisma, 'secret');
    const state = await svc.setGhostMode('user-1', true);
    expect(state.isAnonymous).toBe(true);
    expect(state.anonymousAlias).toMatch(/^Anon-[0-9a-f]{8}$/);
    expect(store['user-1']!.ghostMode).toBe(true);
  });

  it('disabling ghost mode persists and omits the alias', async () => {
    const { prisma, store } = mockPrisma();
    const svc = new AnonymousIdentityService(prisma, 'secret');
    const state = await svc.setGhostMode('user-1', false);
    expect(state.isAnonymous).toBe(false);
    expect(state.anonymousAlias).toBeUndefined();
    expect(store['user-1']!.ghostMode).toBe(false);
  });

  it('alias is stable per user and does not embed the user id', () => {
    const svc = new AnonymousIdentityService(mockPrisma().prisma, 'secret');
    expect(svc.aliasForUser('user-1')).toBe(svc.aliasForUser('user-1'));
    expect(svc.aliasForUser('user-1')).not.toBe(svc.aliasForUser('user-2'));
    expect(svc.aliasForUser('secret-id')).not.toContain('secret-id');
  });

  it('reflects persisted ghost mode on read', async () => {
    const { prisma } = mockPrisma();
    const svc = new AnonymousIdentityService(prisma, 'secret');
    await svc.setGhostMode('user-1', true);
    const state = await svc.getGhostMode('user-1');
    expect(state.isAnonymous).toBe(true);
    expect(state.anonymousAlias).toMatch(/^Anon-[0-9a-f]{8}$/);
  });
});
