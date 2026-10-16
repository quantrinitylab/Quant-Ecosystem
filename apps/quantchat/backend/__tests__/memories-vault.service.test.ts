// ============================================================================
// QC-F-450 — MemoriesVaultService regression tests ('My Eyes Only')
//
// Real argon2id hashing via @quant/auth's passwordService (no fake crypto);
// only Prisma is an in-memory fake with stable, module-level identities.
// Every test here fails against the pre-fix tree for the simplest reason:
// the service did not exist — the vault itself was missing (Memory rows
// had no isPrivate flag, no credential, no unlock token).
//
// Security invariants pinned:
//   - only the argon2id PHC hash is stored; the plaintext passcode appears
//     NOWHERE in any persisted record;
//   - passcode == account password is refused at set/change;
//   - 5 shared-counter failures across verify/change/reset lock all three
//     for 15 minutes — the CORRECT secret is refused during the lockout,
//     and works again after it expires;
//   - unlock tokens are opaque, hash-at-rest, single-live-per-user, and
//     revoked by change/reset/lock;
//   - reset (account-password proof) hard-deletes private items only and
//     leaves public items untouched; OTP-only accounts (unusable password
//     marker) get an honest 409 and lose nothing.
// ============================================================================
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { passwordService } from '@quant/auth';
import {
  MemoriesVaultService,
  type MemoriesVaultCredentialRecord,
  type MemoriesVaultPrismaClient,
  type MemoriesVaultUnlockRecord,
} from '../services/memories-vault.service';

const USER = 'user_vault';
const OTHER_USER = 'user_other';
const OTP_USER = 'user_otp_only';
const PASSCODE = '90210';
const WRONG_PASSCODE = '11111';
const NEW_PASSCODE = '24680';
/** The account password is itself digit-only so passcode==password is testable. */
const ACCOUNT_PASSWORD = '135790';
const UNUSABLE_MARKER = '!phone-otp-no-password';

interface FakeMemoryRow {
  id: string;
  userId: string;
  isPrivate: boolean;
}

function makeFakePrisma() {
  const state = {
    credential: null as MemoriesVaultCredentialRecord | null,
    unlocks: [] as MemoriesVaultUnlockRecord[],
    users: new Map<string, { id: string; passwordHash: string }>(),
    memories: [] as FakeMemoryRow[],
    deletedMemoryIds: [] as string[],
  };
  let seq = 0;

  // Typed as the service's real structural interface (no cast at the call
  // site) — the fake must satisfy the same contract production Prisma does.
  const prisma: MemoriesVaultPrismaClient = {
    memoriesVaultCredential: {
      findUnique: async (args: unknown) => {
        const { where } = args as { where: { userId: string } };
        return state.credential && state.credential.userId === where.userId
          ? { ...state.credential }
          : null;
      },
      create: async (args: unknown) => {
        const { data } = args as {
          data: Omit<MemoriesVaultCredentialRecord, 'id' | 'createdAt' | 'updatedAt'>;
        };
        state.credential = {
          id: `cred-${++seq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        return { ...state.credential };
      },
      update: async (args: unknown) => {
        const { data } = args as { data: Partial<MemoriesVaultCredentialRecord> };
        Object.assign(state.credential as object, data);
        return { ...(state.credential as MemoriesVaultCredentialRecord) };
      },
      delete: async () => {
        const gone = state.credential as MemoriesVaultCredentialRecord;
        state.credential = null;
        return gone;
      },
    },
    memoriesVaultUnlock: {
      create: async (args: unknown) => {
        const { data } = args as {
          data: Omit<MemoriesVaultUnlockRecord, 'id' | 'createdAt'>;
        };
        const row: MemoriesVaultUnlockRecord = {
          id: `unl-${++seq}`,
          createdAt: new Date(),
          ...data,
        };
        state.unlocks.push(row);
        return { ...row };
      },
      findUnique: async (args: unknown) => {
        const { where } = args as { where: { tokenHash: string } };
        const row = state.unlocks.find((u) => u.tokenHash === where.tokenHash);
        return row ? { ...row } : null;
      },
      deleteMany: async (args: unknown) => {
        const { where } = args as { where: { userId?: string; id?: string } };
        const before = state.unlocks.length;
        state.unlocks = state.unlocks.filter(
          (u) =>
            !((where.userId && u.userId === where.userId) || (where.id && u.id === where.id)),
        );
        return { count: before - state.unlocks.length };
      },
    },
    user: {
      findUnique: async (args: unknown) => {
        const { where } = args as { where: { id: string } };
        return state.users.get(where.id) ?? null;
      },
    },
    memory: {
      findMany: async (args: unknown) => {
        const { where } = args as { where: { userId: string; isPrivate: boolean } };
        return state.memories
          .filter((m) => m.userId === where.userId && m.isPrivate === where.isPrivate)
          .map((m) => ({ id: m.id }));
      },
      delete: async (args: unknown) => {
        const { where } = args as { where: { id: string } };
        state.deletedMemoryIds.push(where.id);
        state.memories = state.memories.filter((m) => m.id !== where.id);
        return {};
      },
    },
  };

  return { prisma, state };
}

type AppErr = Error & { statusCode?: number; code?: string; details?: Record<string, unknown> };

async function errorOf(promise: Promise<unknown>): Promise<AppErr> {
  try {
    await promise;
  } catch (err) {
    return err as AppErr;
  }
  throw new Error('Expected the call to reject, but it resolved');
}

describe('MemoriesVaultService (QC-F-450)', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let service: MemoriesVaultService;
  let accountPasswordHash: string;

  beforeAll(async () => {
    accountPasswordHash = await passwordService.hash(ACCOUNT_PASSWORD);
  });

  beforeEach(() => {
    fake = makeFakePrisma();
    service = new MemoriesVaultService(fake.prisma);
    fake.state.users.set(USER, { id: USER, passwordHash: accountPasswordHash });
    fake.state.users.set(OTHER_USER, { id: OTHER_USER, passwordHash: accountPasswordHash });
    fake.state.users.set(OTP_USER, { id: OTP_USER, passwordHash: UNUSABLE_MARKER });
  });

  it('set stores ONLY an argon2id hash — the plaintext passcode is nowhere in the record', async () => {
    await service.setPasscode(USER, PASSCODE);

    const cred = fake.state.credential;
    expect(cred).not.toBeNull();
    expect(cred?.passcodeHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(cred)).not.toContain(PASSCODE);
    expect(cred?.failedAttempts).toBe(0);
  });

  it('set refuses a second passcode with 409 PASSCODE_ALREADY_SET', async () => {
    await service.setPasscode(USER, PASSCODE);
    const err = await errorOf(service.setPasscode(USER, NEW_PASSCODE));
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('PASSCODE_ALREADY_SET');
  });

  it('set refuses a passcode equal to the account password (400 PASSCODE_EQUALS_PASSWORD)', async () => {
    const err = await errorOf(service.setPasscode(USER, ACCOUNT_PASSWORD));
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('PASSCODE_EQUALS_PASSWORD');
    expect(fake.state.credential).toBeNull();
  });

  it('status reports hasPasscode and resetAvailable honestly, with no secret fields', async () => {
    expect(await service.getStatus(USER)).toEqual({ hasPasscode: false, resetAvailable: true });
    expect(await service.getStatus(OTP_USER)).toEqual({
      hasPasscode: false,
      resetAvailable: false,
    });
    await service.setPasscode(USER, PASSCODE);
    const status = await service.getStatus(USER);
    expect(status.hasPasscode).toBe(true);
    expect(JSON.stringify(status)).not.toContain('passcodeHash');
    expect(JSON.stringify(status)).not.toContain('failedAttempts');
  });

  it('verify before any passcode is set -> 409 PASSCODE_NOT_SET', async () => {
    const err = await errorOf(service.verifyPasscode(USER, PASSCODE));
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('PASSCODE_NOT_SET');
  });

  it('verify with the correct passcode issues an opaque token stored ONLY as SHA-256 hex', async () => {
    await service.setPasscode(USER, PASSCODE);
    const grant = await service.verifyPasscode(USER, PASSCODE);

    expect(grant.unlockToken).toMatch(/^qmu_[A-Za-z0-9_-]{43}$/);
    expect(grant.expiresInSec).toBe(300);
    expect(fake.state.unlocks).toHaveLength(1);
    expect(fake.state.unlocks[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fake.state.unlocks)).not.toContain(grant.unlockToken);

    await expect(service.requireUnlock(USER, grant.unlockToken)).resolves.toBeUndefined();
  });

  it('verify with a wrong passcode -> 401 INVALID_PASSCODE and the shared counter moves', async () => {
    await service.setPasscode(USER, PASSCODE);
    const err = await errorOf(service.verifyPasscode(USER, WRONG_PASSCODE));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_PASSCODE');
    expect(fake.state.credential?.failedAttempts).toBe(1);
    expect(fake.state.unlocks).toHaveLength(0);
  });

  it('5 failures lock verify/change/reset for 15 min — even the CORRECT passcode is refused — then it recovers', async () => {
    await service.setPasscode(USER, PASSCODE);
    const t0 = new Date('2026-10-16T12:00:00.000Z');
    for (let i = 0; i < 5; i++) {
      const err = await errorOf(service.verifyPasscode(USER, WRONG_PASSCODE, t0));
      expect(err.code).toBe('INVALID_PASSCODE');
    }
    expect(fake.state.credential?.failedAttempts).toBe(5);
    expect(fake.state.credential?.lockoutUntil).not.toBeNull();

    const locked = await errorOf(service.verifyPasscode(USER, PASSCODE, t0));
    expect(locked.statusCode).toBe(429);
    expect(locked.code).toBe('PASSCODE_LOCKED');
    expect(locked.details?.['retryAfterSec']).toBeGreaterThan(0);

    // change and reset are locked too — one counter, no oracle bypass.
    const lockedChange = await errorOf(service.changePasscode(USER, PASSCODE, NEW_PASSCODE, t0));
    expect(lockedChange.code).toBe('PASSCODE_LOCKED');
    const lockedReset = await errorOf(service.resetPasscode(USER, ACCOUNT_PASSWORD, t0));
    expect(lockedReset.code).toBe('PASSCODE_LOCKED');

    // After the lockout expires the correct passcode works and the counter resets.
    const after = new Date(t0.getTime() + 16 * 60 * 1000);
    const grant = await service.verifyPasscode(USER, PASSCODE, after);
    expect(grant.unlockToken).toMatch(/^qmu_/);
    expect(fake.state.credential?.failedAttempts).toBe(0);
    expect(fake.state.credential?.lockoutUntil).toBeNull();
  });

  it('an expired token no longer unlocks (401 MEMORIES_LOCKED), and neither does another user\'s token', async () => {
    await service.setPasscode(USER, PASSCODE);
    const t0 = new Date('2026-10-16T12:00:00.000Z');
    const grant = await service.verifyPasscode(USER, PASSCODE, t0);

    const expired = await errorOf(
      service.requireUnlock(USER, grant.unlockToken, new Date(t0.getTime() + 6 * 60 * 1000)),
    );
    expect(expired.statusCode).toBe(401);
    expect(expired.code).toBe('MEMORIES_LOCKED');

    const foreign = await errorOf(service.requireUnlock(OTHER_USER, grant.unlockToken, t0));
    expect(foreign.code).toBe('MEMORIES_LOCKED');

    const missing = await errorOf(service.requireUnlock(USER, undefined, t0));
    expect(missing.code).toBe('MEMORIES_LOCKED');
  });

  it('a fresh verify revokes the previous token (one live token per user)', async () => {
    await service.setPasscode(USER, PASSCODE);
    const first = await service.verifyPasscode(USER, PASSCODE);
    const second = await service.verifyPasscode(USER, PASSCODE);

    expect(fake.state.unlocks).toHaveLength(1);
    const stale = await errorOf(service.requireUnlock(USER, first.unlockToken));
    expect(stale.code).toBe('MEMORIES_LOCKED');
    await expect(service.requireUnlock(USER, second.unlockToken)).resolves.toBeUndefined();
  });

  it('change: wrong current counts on the shared counter; success revokes tokens and rotates the passcode', async () => {
    await service.setPasscode(USER, PASSCODE);
    const grant = await service.verifyPasscode(USER, PASSCODE);
    fake.state.memories.push({ id: 'mem-priv', userId: USER, isPrivate: true });

    const wrong = await errorOf(service.changePasscode(USER, WRONG_PASSCODE, NEW_PASSCODE));
    expect(wrong.code).toBe('INVALID_PASSCODE');
    expect(fake.state.credential?.failedAttempts).toBe(1);

    await service.changePasscode(USER, PASSCODE, NEW_PASSCODE);

    const revoked = await errorOf(service.requireUnlock(USER, grant.unlockToken));
    expect(revoked.code).toBe('MEMORIES_LOCKED');
    const oldPass = await errorOf(service.verifyPasscode(USER, PASSCODE));
    expect(oldPass.code).toBe('INVALID_PASSCODE');
    await expect(service.verifyPasscode(USER, NEW_PASSCODE)).resolves.toBeDefined();
    // Items stay private through a change.
    expect(fake.state.memories).toEqual([{ id: 'mem-priv', userId: USER, isPrivate: true }]);
    expect(fake.state.deletedMemoryIds).toEqual([]);
  });

  it('change refuses new == current and new == account password', async () => {
    await service.setPasscode(USER, PASSCODE);
    const same = await errorOf(service.changePasscode(USER, PASSCODE, PASSCODE));
    expect(same.statusCode).toBe(400);
    expect(same.code).toBe('VALIDATION_ERROR');
    const equalsAccount = await errorOf(service.changePasscode(USER, PASSCODE, ACCOUNT_PASSWORD));
    expect(equalsAccount.code).toBe('PASSCODE_EQUALS_PASSWORD');
  });

  it('reset with the account password hard-deletes private items ONLY, drops credential + tokens', async () => {
    await service.setPasscode(USER, PASSCODE);
    const grant = await service.verifyPasscode(USER, PASSCODE);
    fake.state.memories.push(
      { id: 'mem-priv-1', userId: USER, isPrivate: true },
      { id: 'mem-priv-2', userId: USER, isPrivate: true },
      { id: 'mem-pub', userId: USER, isPrivate: false },
    );

    await service.resetPasscode(USER, ACCOUNT_PASSWORD);

    expect(fake.state.deletedMemoryIds.sort()).toEqual(['mem-priv-1', 'mem-priv-2']);
    expect(fake.state.memories).toEqual([{ id: 'mem-pub', userId: USER, isPrivate: false }]);
    expect(fake.state.credential).toBeNull();
    expect(fake.state.unlocks).toHaveLength(0);
    expect((await service.getStatus(USER)).hasPasscode).toBe(false);
    const revoked = await errorOf(service.requireUnlock(USER, grant.unlockToken));
    expect(revoked.code).toBe('MEMORIES_LOCKED');
  });

  it('reset with a WRONG account password -> 401, counts on the shared counter, deletes nothing', async () => {
    await service.setPasscode(USER, PASSCODE);
    fake.state.memories.push({ id: 'mem-priv', userId: USER, isPrivate: true });

    const err = await errorOf(service.resetPasscode(USER, 'wrong-password'));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCOUNT_PASSWORD');
    expect(fake.state.credential?.failedAttempts).toBe(1);
    expect(fake.state.deletedMemoryIds).toEqual([]);
    expect(fake.state.credential).not.toBeNull();
  });

  it('reset for an OTP-only account -> honest 409 PASSCODE_RESET_UNAVAILABLE; vault and items untouched', async () => {
    await service.setPasscode(OTP_USER, PASSCODE);
    fake.state.memories.push({ id: 'mem-priv', userId: OTP_USER, isPrivate: true });

    const err = await errorOf(service.resetPasscode(OTP_USER, 'anything'));
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('PASSCODE_RESET_UNAVAILABLE');
    expect(fake.state.credential).not.toBeNull();
    expect(fake.state.deletedMemoryIds).toEqual([]);
    expect(fake.state.memories).toHaveLength(1);
  });

  it('lock revokes every unlock token', async () => {
    await service.setPasscode(USER, PASSCODE);
    const grant = await service.verifyPasscode(USER, PASSCODE);
    await service.lock(USER);
    expect(fake.state.unlocks).toHaveLength(0);
    const err = await errorOf(service.requireUnlock(USER, grant.unlockToken));
    expect(err.code).toBe('MEMORIES_LOCKED');
  });
});
