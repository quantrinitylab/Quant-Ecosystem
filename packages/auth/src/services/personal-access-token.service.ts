import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const TOKEN_PREFIX = 'qcp';
const TOKEN_ID_PATTERN = /^[0-9a-f]{24}$/;
const TOKEN_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export type PersonalAccessTokenScope = 'repo:read' | 'repo:write' | 'repo:admin';

export interface GeneratedPersonalAccessToken {
  token: string;
  tokenId: string;
  tokenHash: string;
}

export interface VerifiedPersonalAccessToken {
  userId: string;
  scopes: string[];
  tokenRecordId: string;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** AUTH-04 comparison shape. PATs are 256-bit random secrets, not passwords. */
function hashesMatch(computedHex: string, storedHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(storedHex)) return false;
  const computed = Buffer.from(computedHex, 'hex');
  const stored = Buffer.from(storedHex, 'hex');
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

export function generatePersonalAccessToken(): GeneratedPersonalAccessToken {
  const tokenId = randomBytes(12).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const token = `${TOKEN_PREFIX}_${tokenId}_${secret}`;
  return { token, tokenId, tokenHash: sha256Hex(token) };
}

export async function verifyPersonalAccessToken(
  prisma: PrismaClient,
  token: string,
  now: Date = new Date(),
): Promise<VerifiedPersonalAccessToken | null> {
  const parts = token.split('_');
  if (
    parts.length !== 3 ||
    parts[0] !== TOKEN_PREFIX ||
    !TOKEN_ID_PATTERN.test(parts[1] ?? '') ||
    !TOKEN_SECRET_PATTERN.test(parts[2] ?? '')
  ) {
    return null;
  }

  const record = await prisma.personalAccessToken.findUnique({
    where: { tokenId: parts[1] },
  });
  if (!record) return null;

  // Prove possession before checking state; tokenId alone must not reveal
  // whether a credential is live, expired, or revoked.
  if (!hashesMatch(sha256Hex(token), record.tokenHash)) return null;
  if (record.revokedAt || record.expiresAt.getTime() <= now.getTime()) return null;

  if (
    !record.lastUsedAt ||
    now.getTime() - record.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS
  ) {
    await prisma.personalAccessToken
      .update({ where: { id: record.id }, data: { lastUsedAt: now } })
      .catch(() => undefined);
  }

  return {
    userId: record.userId,
    scopes: record.scopes,
    tokenRecordId: record.id,
  };
}
