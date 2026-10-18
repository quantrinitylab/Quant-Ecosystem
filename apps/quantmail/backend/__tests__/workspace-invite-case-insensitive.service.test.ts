/**
 * Workspace invite existing-user lookup — case-insensitive matching.
 *
 * createInvites normalizes invite emails to lowercase, but legacy user rows
 * predate email normalization and may carry mixed case (e.g.
 * `LegacyCase@Example.com`). The lookup must therefore be case-insensitive
 * (Postgres `mode: 'insensitive'`, mirroring routes/auth.ts
 * `findUserByEmailInsensitive`); the old exact-match `findUnique` never hit
 * those rows, so an existing member was not recognized and a fresh invite was
 * minted for someone who already had an account.
 *
 * The `user.findFirst` double below emulates Postgres `mode: 'insensitive'`
 * semantics (comparison on the lowercased value) over a seeded user table, so a
 * lowercase invite email resolves to the mixed-case legacy row exactly like
 * production does.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from '../services/workspace.service';

const ORG_ID = 'org-1';
const ACTOR_ID = 'u-actor';
const LEGACY_USER_ID = 'u-legacy';

/** One legacy mixed-case user row, seeded like a pre-normalization account. */
const USERS = [{ id: LEGACY_USER_ID, email: 'LegacyCase@Example.com' }];

interface Membership {
  id: string;
  orgId: string;
  userId: string;
  role: string;
}

function createMockPrisma(extraMemberships: Membership[] = []) {
  const memberships: Membership[] = [
    { id: 'mem-actor', orgId: ORG_ID, userId: ACTOR_ID, role: 'ADMIN' },
    ...extraMemberships,
  ];
  return {
    user: {
      // Emulates `where: { email: { equals, mode: 'insensitive' }, deletedAt: null }`:
      // matches the seeded row regardless of the stored row's case.
      findFirst: vi.fn(
        async (args: {
          where: { email: { equals: string; mode?: string }; deletedAt?: unknown };
          select?: unknown;
        }) => {
          expect(args.where.email.mode).toBe('insensitive');
          const wanted = args.where.email.equals.toLowerCase();
          const found = USERS.find((user) => user.email.toLowerCase() === wanted);
          return found ? { id: found.id } : null;
        },
      ),
      findUnique: vi.fn(async () => ({ displayName: 'Ada', email: 'ada@x.example' })),
      findMany: vi.fn(async () => []),
    },
    organization: {
      findUnique: vi.fn(async () => ({ id: ORG_ID, name: 'Acme Co' })),
    },
    organizationMember: {
      findUnique: vi.fn(async (args: { where: { orgId_userId: { orgId: string; userId: string } } }) => {
        const { orgId, userId } = args.where.orgId_userId;
        return memberships.find((m) => m.orgId === orgId && m.userId === userId) ?? null;
      }),
      findMany: vi.fn(async () => []),
    },
    workspaceInvite: {
      updateMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'inv-1',
        email: args.data.email,
        role: args.data.role,
        message: args.data.message ?? null,
      })),
      findMany: vi.fn(async () => []),
    },
  };
}

describe('workspace createInvites — case-insensitive existing-user lookup', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let svc: WorkspaceService;

  beforeEach(() => {
    prisma = createMockPrisma([{ id: 'mem-legacy', orgId: ORG_ID, userId: LEGACY_USER_ID, role: 'MEMBER' }]);
    svc = new WorkspaceService(prisma as never);
    (svc as unknown as { sendInviteEmail: unknown }).sendInviteEmail = vi.fn(async () => true);
  });

  it('recognizes a legacy mixed-case user as already_member instead of minting an invite', async () => {
    const out = await svc.createInvites(ORG_ID, ACTOR_ID, {
      emails: ['LEGACYCASE@example.com'],
      role: 'MEMBER',
    });

    const calls = (prisma.user.findFirst as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    // The invite email is normalized to lowercase; the query must still be
    // case-insensitive to reach the mixed-case legacy row.
    expect(calls[0]?.[0].where.email.equals).toBe('legacycase@example.com');
    expect(calls[0]?.[0].where.email.mode).toBe('insensitive');

    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ email: 'legacycase@example.com', status: 'already_member' });
    expect(prisma.workspaceInvite.create).not.toHaveBeenCalled();
  });

  it('mints a fresh invite when no user matches (normalized email stored on the invite)', async () => {
    const out = await svc.createInvites(ORG_ID, ACTOR_ID, {
      emails: ['  BrandNew@Example.com '],
      role: 'MEMBER',
    });

    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ email: 'brandnew@example.com', status: 'invited' });
    expect(prisma.workspaceInvite.create).toHaveBeenCalledTimes(1);
    expect((prisma.workspaceInvite.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].data.email).toBe(
      'brandnew@example.com',
    );
    const send = (svc as unknown as { sendInviteEmail: ReturnType<typeof vi.fn> }).sendInviteEmail;
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].to).toBe('brandnew@example.com');
  });

  it('detects an existing user who is not yet a member and mints an invite for them', async () => {
    const noMemberPrisma = createMockPrisma();
    const noMemberSvc = new WorkspaceService(noMemberPrisma as never);
    (noMemberSvc as unknown as { sendInviteEmail: unknown }).sendInviteEmail = vi.fn(async () => true);

    const out = await noMemberSvc.createInvites(ORG_ID, ACTOR_ID, {
      emails: ['LegacyCase@Example.com'],
      role: 'MEMBER',
    });

    // The legacy row is found (case-insensitively) but has no membership, so an
    // invite is correctly minted for an existing user.
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ email: 'legacycase@example.com', status: 'invited' });
    expect(noMemberPrisma.workspaceInvite.create).toHaveBeenCalledTimes(1);
  });
});
