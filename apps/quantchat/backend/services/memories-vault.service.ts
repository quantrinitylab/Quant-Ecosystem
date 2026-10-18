// ============================================================================
// QuantChat - Memories Vault Service (QC-F-450, 'My Eyes Only')
//
// Owns every passcode/unlock rule for the passcode-locked private Memories
// section. Routes stay thin; all security decisions live here:
//
//   - Passcodes are 4-8 digit strings, hashed with the SAME argon2id
//     password service the account password uses (@quant/auth). A numeric
//     passcode is low-entropy, so a fast hash is forbidden for it. The
//     plaintext passcode is never stored, logged, or returned.
//   - A new passcode must differ from the account password (Snapchat's
//     rule) when the account has a usable password hash.
//   - Unlock tokens are opaque (`qmu_` + 256-bit random), stored only as
//     a scrypt hash (hex), live for exactly 5 minutes, and there is at most ONE
//     live token per user: a fresh verify deletes all previous tokens, and
//     change/reset/lock delete them too (instant revoke — a stateless JWT
//     could not do this, which is why JWT was rejected for this purpose).
//   - Brute-force defence is a PERSISTENT per-user counter shared by
//     verify, change (wrong current), and reset (wrong account password):
//     5 consecutive failures lock all three for 15 minutes — during the
//     lockout even the correct secret is refused, otherwise the lockout
//     would be an oracle, not a wall.
//   - Forgotten passcode (reset) is proven with the ACCOUNT PASSWORD, and
//     success permanently hard-deletes every private item (Snapchat
//     parity: opening the vault to anyone who holds the account password
//     would defeat the passcode). Accounts whose password hash is the
//     unusable marker (phone-OTP / SSO-only) cannot reset in this slice —
//     the service says so honestly (PASSCODE_RESET_UNAVAILABLE) instead of
//     inventing a weaker proof.
//
// This is server-side access control, NOT end-to-end encryption: the media
// object itself is not encrypted by this service and no copy anywhere may
// claim otherwise.
// ============================================================================
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import { passwordService } from '@quant/auth';

/** Passcode shape: 4-8 digits, kept as a string (leading zeros survive). */
export const PASSCODE_PATTERN = /^\d{4,8}$/;

/** Consecutive failed proof attempts before the lockout trips. */
export const VAULT_MAX_FAILED_ATTEMPTS = 5;

/** How long verify/change/reset stay refused once the lockout trips. */
export const VAULT_LOCKOUT_MS = 15 * 60 * 1000;

/** Unlock-token lifetime: fixed 5 minutes, no sliding renewal. */
export const VAULT_UNLOCK_TTL_MS = 5 * 60 * 1000;

const UNLOCK_TOKEN_PREFIX = 'qmu_';

/**
 * Stand-in argon2id digest verified against when no credential exists, so
 * "passcode set or not" cannot be probed by timing (same value and pattern
 * as the login path in routes/auth.ts).
 */
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$c29tZXNhbHQ';

export interface MemoriesVaultCredentialRecord {
  id: string;
  userId: string;
  passcodeHash: string;
  failedAttempts: number;
  lockoutUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoriesVaultUnlockRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Minimal structural surface of the Prisma client this service relies on —
 * same decoupling pattern as {@link MemoryPrismaClient}, so unit tests can
 * satisfy it with an in-memory fake.
 */
export interface MemoriesVaultPrismaClient {
  memoriesVaultCredential: {
    findUnique(args: unknown): Promise<MemoriesVaultCredentialRecord | null>;
    create(args: unknown): Promise<MemoriesVaultCredentialRecord>;
    update(args: unknown): Promise<MemoriesVaultCredentialRecord>;
    delete(args: unknown): Promise<MemoriesVaultCredentialRecord>;
  };
  memoriesVaultUnlock: {
    create(args: unknown): Promise<MemoriesVaultUnlockRecord>;
    findUnique(args: unknown): Promise<MemoriesVaultUnlockRecord | null>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  user: {
    findUnique(args: unknown): Promise<{ id: string; passwordHash: string } | null>;
  };
  memory: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
    delete(args: unknown): Promise<unknown>;
  };
}

export interface VaultStatus {
  hasPasscode: boolean;
  resetAvailable: boolean;
}

export interface VaultUnlockGrant {
  unlockToken: string;
  expiresAt: Date;
  expiresInSec: number;
}

/**
 * Domain separator used as the scrypt salt for unlock-token storage
 * hashes. The hashed value is a 256-bit random token, not a password:
 * salts exist to protect low-entropy secrets, and this fixed label is
 * safe (and keeps the hash deterministic, which lookup-by-hash needs)
 * precisely because the token's entropy is 256 bits. scrypt is used for
 * the storage hash so no fast general-purpose hash ever touches a value
 * issued by the passcode-verify path (CodeQL js/insufficient-password-hash
 * disposition, ci-green-captain on PR #1281).
 */
const TOKEN_HASH_SALT = 'quantchat-memories-vault-unlock-v1';

function tokenHashHex(value: string): string {
  return scryptSync(value, TOKEN_HASH_SALT, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}

function tokenHashesMatch(computedHex: string, storedHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(storedHex)) return false;
  const computed = Buffer.from(computedHex, 'hex');
  const stored = Buffer.from(storedHex, 'hex');
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

/**
 * A password hash is "usable" when it is a real argon2 PHC string. Phone-OTP
 * and SSO-only accounts carry the '!phone-otp-no-password' marker instead
 * (routes/auth.ts UNUSABLE_PASSWORD) — those accounts cannot prove identity
 * with a password, so password-based reset is unavailable to them.
 */
export function isUsablePasswordHash(hash: unknown): hash is string {
  return typeof hash === 'string' && hash.startsWith('$argon2');
}

function lockedError(lockoutUntil: Date, now: Date) {
  const retryAfterSec = Math.max(1, Math.ceil((lockoutUntil.getTime() - now.getTime()) / 1000));
  return createAppError('Too many failed attempts — the vault is locked for a while', 429, 'PASSCODE_LOCKED', {
    retryAfterSec,
  });
}

export class MemoriesVaultService {
  constructor(private readonly prisma: MemoriesVaultPrismaClient) {}

  private async getCredential(userId: string): Promise<MemoriesVaultCredentialRecord | null> {
    return this.prisma.memoriesVaultCredential.findUnique({ where: { userId } });
  }

  private async getUserPasswordHash(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    return user?.passwordHash ?? null;
  }

  /** Refuse while a lockout is live — even for the correct secret. */
  private assertNotLockedOut(credential: MemoriesVaultCredentialRecord, now: Date): void {
    if (credential.lockoutUntil && credential.lockoutUntil.getTime() > now.getTime()) {
      throw lockedError(credential.lockoutUntil, now);
    }
  }

  /**
   * Count one failed proof against the shared counter, tripping the
   * 15-minute lockout at the threshold. An already-expired lockout starts
   * the counter fresh (the lockout having passed is the reset).
   */
  private async registerFailedAttempt(
    credential: MemoriesVaultCredentialRecord,
    now: Date,
  ): Promise<void> {
    const lockoutExpired =
      credential.lockoutUntil !== null && credential.lockoutUntil.getTime() <= now.getTime();
    const attempts = (lockoutExpired ? 0 : credential.failedAttempts) + 1;
    await this.prisma.memoriesVaultCredential.update({
      where: { userId: credential.userId },
      data: {
        failedAttempts: attempts,
        lockoutUntil: attempts >= VAULT_MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + VAULT_LOCKOUT_MS) : lockoutExpired ? null : credential.lockoutUntil,
      },
    });
  }

  private async clearFailedAttempts(credential: MemoriesVaultCredentialRecord): Promise<void> {
    if (credential.failedAttempts !== 0 || credential.lockoutUntil !== null) {
      await this.prisma.memoriesVaultCredential.update({
        where: { userId: credential.userId },
        data: { failedAttempts: 0, lockoutUntil: null },
      });
    }
  }

  private async revokeAllUnlocks(userId: string): Promise<void> {
    await this.prisma.memoriesVaultUnlock.deleteMany({ where: { userId } });
  }

  /**
   * Status for the entry card/modal. Deliberately minimal: whether a
   * passcode exists and whether password-based reset is available. Hash,
   * attempt counts, and lockout state are never exposed here.
   */
  async getStatus(userId: string): Promise<VaultStatus> {
    const [credential, passwordHash] = await Promise.all([
      this.getCredential(userId),
      this.getUserPasswordHash(userId),
    ]);
    return {
      hasPasscode: credential !== null,
      resetAvailable: isUsablePasswordHash(passwordHash),
    };
  }

  /**
   * Set the first passcode. Refuses when one already exists (change is a
   * separate, proven flow) and when the passcode equals the account
   * password.
   */
  async setPasscode(userId: string, passcode: string): Promise<void> {
    const existing = await this.getCredential(userId);
    if (existing) {
      throw createAppError('A vault passcode is already set', 409, 'PASSCODE_ALREADY_SET');
    }
    const passwordHash = await this.getUserPasswordHash(userId);
    if (
      isUsablePasswordHash(passwordHash) &&
      (await passwordService.verify(passwordHash, passcode).catch(() => false))
    ) {
      throw createAppError(
        'The vault passcode must be different from your account password',
        400,
        'PASSCODE_EQUALS_PASSWORD',
      );
    }
    const passcodeHash = await passwordService.hash(passcode);
    await this.prisma.memoriesVaultCredential.create({
      data: { userId, passcodeHash, failedAttempts: 0, lockoutUntil: null },
    });
  }

  /**
   * Verify a passcode and issue the single live unlock token.
   * Wrong passcodes share the brute-force counter with change/reset.
   */
  async verifyPasscode(userId: string, passcode: string, now: Date = new Date()): Promise<VaultUnlockGrant> {
    const credential = await this.getCredential(userId);
    if (!credential) {
      // Timing equalization: do the same argon2 work as a real verify.
      await passwordService.verify(DUMMY_HASH, passcode).catch(() => false);
      throw createAppError('No vault passcode is set', 409, 'PASSCODE_NOT_SET');
    }
    this.assertNotLockedOut(credential, now);

    const ok = await passwordService.verify(credential.passcodeHash, passcode).catch(() => false);
    if (!ok) {
      await this.registerFailedAttempt(credential, now);
      throw createAppError('Incorrect passcode', 401, 'INVALID_PASSCODE');
    }
    await this.clearFailedAttempts(credential);

    // One live token per user: issuing a new one revokes every older one.
    await this.revokeAllUnlocks(userId);
    const unlockToken = UNLOCK_TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + VAULT_UNLOCK_TTL_MS);
    await this.prisma.memoriesVaultUnlock.create({
      data: { userId, tokenHash: tokenHashHex(unlockToken), expiresAt },
    });
    return { unlockToken, expiresAt, expiresInSec: Math.floor(VAULT_UNLOCK_TTL_MS / 1000) };
  }

  /**
   * Change the passcode (current passcode is the proof). A successful
   * change revokes all unlock tokens — an old token must not open the
   * vault under a new passcode. Items stay private.
   */
  async changePasscode(
    userId: string,
    currentPasscode: string,
    newPasscode: string,
    now: Date = new Date(),
  ): Promise<void> {
    const credential = await this.getCredential(userId);
    if (!credential) {
      await passwordService.verify(DUMMY_HASH, currentPasscode).catch(() => false);
      throw createAppError('No vault passcode is set', 409, 'PASSCODE_NOT_SET');
    }
    this.assertNotLockedOut(credential, now);

    const ok = await passwordService.verify(credential.passcodeHash, currentPasscode).catch(() => false);
    if (!ok) {
      await this.registerFailedAttempt(credential, now);
      throw createAppError('Incorrect passcode', 401, 'INVALID_PASSCODE');
    }
    if (newPasscode === currentPasscode) {
      throw createAppError('The new passcode must be different from the current one', 400, 'VALIDATION_ERROR');
    }
    const passwordHash = await this.getUserPasswordHash(userId);
    if (
      isUsablePasswordHash(passwordHash) &&
      (await passwordService.verify(passwordHash, newPasscode).catch(() => false))
    ) {
      throw createAppError(
        'The vault passcode must be different from your account password',
        400,
        'PASSCODE_EQUALS_PASSWORD',
      );
    }
    const passcodeHash = await passwordService.hash(newPasscode);
    await this.prisma.memoriesVaultCredential.update({
      where: { userId },
      data: { passcodeHash, failedAttempts: 0, lockoutUntil: null },
    });
    await this.revokeAllUnlocks(userId);
  }

  /**
   * Forgotten-passcode reset. Proof = account password. On success the
   * credential and all unlock tokens are deleted AND every private item
   * is permanently hard-deleted (not soft-deleted — no undo window);
   * public items are untouched. OTP/SSO-only accounts (unusable password
   * marker) get an honest 409: their items stay locked, nothing is
   * deleted, and no weaker proof is invented in this slice.
   */
  async resetPasscode(userId: string, accountPassword: string, now: Date = new Date()): Promise<void> {
    const credential = await this.getCredential(userId);
    if (!credential) {
      throw createAppError('No vault passcode is set', 409, 'PASSCODE_NOT_SET');
    }
    this.assertNotLockedOut(credential, now);

    const passwordHash = await this.getUserPasswordHash(userId);
    if (!isUsablePasswordHash(passwordHash)) {
      throw createAppError(
        'Passcode reset is not available for this account',
        409,
        'PASSCODE_RESET_UNAVAILABLE',
      );
    }
    const ok = await passwordService.verify(passwordHash, accountPassword).catch(() => false);
    if (!ok) {
      await this.registerFailedAttempt(credential, now);
      throw createAppError('Incorrect account password', 401, 'INVALID_ACCOUNT_PASSWORD');
    }

    const privateItems = await this.prisma.memory.findMany({
      where: { userId, isPrivate: true },
      select: { id: true },
    });
    for (const item of privateItems) {
      await this.prisma.memory.delete({ where: { id: item.id } });
    }
    await this.revokeAllUnlocks(userId);
    await this.prisma.memoriesVaultCredential.delete({ where: { userId } });
  }

  /** Lock the vault: revoke every unlock token. Always allowed. */
  async lock(userId: string): Promise<void> {
    await this.revokeAllUnlocks(userId);
  }

  /**
   * The vault gate. Throws 401 MEMORIES_LOCKED unless `token` is a live
   * unlock token belonging to `userId`. Returns nothing on success.
   * An expired token row is deleted lazily when encountered.
   */
  async requireUnlock(userId: string, token: string | undefined, now: Date = new Date()): Promise<void> {
    if (!token) {
      throw createAppError('The vault is locked', 401, 'MEMORIES_LOCKED');
    }
    const record = await this.prisma.memoriesVaultUnlock.findUnique({
      where: { tokenHash: tokenHashHex(token) },
    });
    if (!record || record.userId !== userId || !tokenHashesMatch(tokenHashHex(token), record.tokenHash)) {
      throw createAppError('The vault is locked', 401, 'MEMORIES_LOCKED');
    }
    if (record.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.memoriesVaultUnlock.deleteMany({ where: { id: record.id } });
      throw createAppError('The vault is locked', 401, 'MEMORIES_LOCKED');
    }
  }

  /**
   * Non-throwing variant for delete/restore: the route needs "unlocked or
   * not" to decide the privacy scope (unlocked callers may touch private
   * rows; locked callers get public scope, where private rows 404).
   */
  async hasValidUnlock(userId: string, token: string | undefined, now: Date = new Date()): Promise<boolean> {
    try {
      await this.requireUnlock(userId, token, now);
      return true;
    } catch {
      return false;
    }
  }
}
