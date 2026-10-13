// ============================================================================\
// QuantChat — refresh-token store (QC-F-118)
// ============================================================================
//
// Refresh redemption used to be 100% stateless: verifyRefreshToken checked
// signature/kind/expiry and POST /auth/refresh minted a fresh pair, but the
// presented token stayed valid for its whole 30-day life no matter how
// often it was replayed, logout revoked nothing server-side (there was not
// even a backend logout route), and no record existed that reuse happened.
// A stolen refresh token was therefore an immortal session the victim
// could never kill.
//
// This store makes redemption stateful on the schema's existing
// RefreshToken model (the same model QuantMail's TokenService already runs
// real rotation + reuse detection on — this is a port of that pattern, not
// a new invention):
//
//   - One row per refresh token. Row `id` = the token's JWT `jti`; the
//     `token` column holds ONLY the SHA-256 hex digest of the token, never
//     the raw token (a database leak must not hand out replayable tokens).
//   - `family` = one login session's whole rotation chain. Login/SSO/OTP
//     issuance starts a new family; rotation carries it forward.
//   - `isRevoked` marks both spent (rotated-away) and revoked rows.
//   - Redemption: binding check (digest + userId + family) → compare-and-
//     set spend of the presented row → successor issued + registered in
//     the same family. Presenting a spent token again is REUSE: the whole
//     family is revoked and the caller gets REFRESH_TOKEN_REUSE_DETECTED.
//   - Grace: the web apiClient fires parallel requests on access expiry
//     with NO single-flight dedupe, so two in-flight requests can present
//     the same refresh token near-simultaneously; the loser would look
//     exactly like reuse. A spent token presented while its family has a
//     live head created within REFRESH_REUSE_GRACE_MS is treated as that
//     race's loser instead: the head is spent and the chain follows
//     forward. (The head lookup retries once after 25ms so a loser that
//     checks while the winner's successor row is still being written is
//     not misread.) Outside the window — or with no live head (e.g. after
//     logout revoked the family) — it is reuse, full stop.
//   - Logout revokes the presented token's whole family (possession of
//     the refresh token + the caller's access-token identity, userId-
//     bound so nobody can revoke someone else's family).
//
// No schema migration: the RefreshToken model already carries every field
// used here (id/userId/token/family/isRevoked/expiresAt/userAgent/
// ipAddress/source).
// ============================================================================

import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { IssuedTokens, SessionSubject, SessionTokenIssuer } from './session-tokens';

/** How long a just-rotated token may be re-presented as a race loser. */
export const REFRESH_REUSE_GRACE_MS = 30_000;

export interface RefreshSessionMeta {
  userAgent?: string;
  ipAddress?: string;
  source?: string;
}

export type RedeemFailureReason = 'legacy' | 'unknown' | 'binding' | 'reuse' | 'unavailable';

export type RedeemResult =
  | { ok: true; tokens: IssuedTokens; via: 'spend' | 'grace' }
  | { ok: false; reason: RedeemFailureReason; familyId?: string };

interface RefreshTokenRow {
  id: string;
  userId: string;
  token: string;
  family: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
}

/** SHA-256 hex digest of a raw refresh token — the only stored form. */
export function digestRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function decodePayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class RefreshTokenStore {
  private readonly now: () => number;
  private readonly graceMs: number;
  private readonly headRetryDelayMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly issuer: SessionTokenIssuer,
    options?: { now?: () => number; graceMs?: number; headRetryDelayMs?: number },
  ) {
    this.now = options?.now ?? (() => Date.now());
    this.graceMs = options?.graceMs ?? REFRESH_REUSE_GRACE_MS;
    this.headRetryDelayMs = options?.headRetryDelayMs ?? 25;
  }

  /**
   * Issue a brand-new session (new family) and register its first row.
   * Every sign-in path (password login, SSO exchange, OTP verify) goes
   * through here — a pair minted without a row can never be redeemed.
   */
  async issueNewSession(
    subject: SessionSubject,
    meta?: RefreshSessionMeta,
  ): Promise<IssuedTokens> {
    const tokens = await this.issuer.issue(subject);
    await this.registerIssuance(tokens, subject.userId, meta);
    return tokens;
  }

  /** Persist the row for an already-issued pair (digest only, never raw). */
  async registerIssuance(
    tokens: IssuedTokens,
    userId: string,
    meta?: RefreshSessionMeta,
  ): Promise<void> {
    const payload = decodePayload(tokens.refreshToken);
    const expSec = typeof payload?.['exp'] === 'number' ? (payload['exp'] as number) : 0;
    await this.prisma.refreshToken.create({
      data: {
        id: tokens.refreshTokenId,
        userId,
        token: digestRefreshToken(tokens.refreshToken),
        family: tokens.familyId,
        expiresAt: new Date(expSec * 1000),
        userAgent: meta?.userAgent?.trim().slice(0, 512) || undefined,
        ipAddress: meta?.ipAddress?.trim().slice(0, 64) || undefined,
        source: meta?.source,
      },
    });
  }

  /**
   * Redeem a verified refresh token. The caller (route) has already run
   * verifyRefreshToken (signature/kind/app/sub) and the account check
   * (user exists, not deleted) BEFORE calling this, so no spend ever
   * happens for a refused account.
   */
  async redeem(args: {
    payload: Record<string, unknown>;
    presentedToken: string;
    subject: SessionSubject;
    meta?: RefreshSessionMeta;
  }): Promise<RedeemResult> {
    const { payload, presentedToken, subject, meta } = args;
    const jti = payload['jti'];
    const fam = payload['fam'];
    const sub = payload['sub'];
    if (typeof jti !== 'string' || typeof fam !== 'string' || typeof sub !== 'string') {
      // Pre-QC-F-118 token: no family claim, no row. Fail closed — the
      // client treats 401 as a dead session and sends the user to /login
      // once. Grandfathering would hand a stolen legacy token a free
      // rotation, which is exactly the attack this finding is about.
      return { ok: false, reason: 'legacy' };
    }

    let row: RefreshTokenRow | null;
    try {
      row = (await this.prisma.refreshToken.findUnique({
        where: { id: jti },
      })) as RefreshTokenRow | null;
    } catch {
      return { ok: false, reason: 'unavailable', familyId: fam };
    }
    if (!row) {
      // A validly-signed token with no row was never registered (or its
      // record is gone): fail closed and kill the claimed family.
      await this.revokeFamily(fam);
      return { ok: false, reason: 'unknown', familyId: fam };
    }

    const bindingOk =
      row.token === digestRefreshToken(presentedToken) && row.userId === sub && row.family === fam;
    if (!bindingOk) {
      await this.revokeFamily(row.family);
      return { ok: false, reason: 'binding', familyId: row.family };
    }

    if (!row.isRevoked) {
      // Compare-and-set spend: exactly one concurrent caller may rotate
      // this token; a count of 0 means a racer spent it between our
      // lookup and now — fall through to the spent-token path below.
      let spent: { count: number };
      try {
        spent = await this.prisma.refreshToken.updateMany({
          where: { id: jti, isRevoked: false },
          data: { isRevoked: true },
        });
      } catch {
        return { ok: false, reason: 'unavailable', familyId: row.family };
      }
      if (spent.count === 1) {
        const tokens = await this.issueSuccessor(subject, row.family, meta);
        if (!tokens) return { ok: false, reason: 'unavailable', familyId: row.family };
        return { ok: true, tokens, via: 'spend' };
      }
    }

    // The presented token is already spent. Chain-follow grace applies
    // only while the family's live head is fresh (created within the
    // grace window — i.e. the winner's rotation just happened). The head
    // lookup retries once after a short delay: the race winner spends the
    // token and registers its successor as two separate writes, and a
    // loser checking in between must not be misread as reuse.
    let head: RefreshTokenRow | null;
    try {
      head = await this.findLiveHead(row.family);
      if (!head && this.headRetryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.headRetryDelayMs));
        head = await this.findLiveHead(row.family);
      }
    } catch {
      return { ok: false, reason: 'unavailable', familyId: row.family };
    }
    if (head && this.now() - head.createdAt.getTime() <= this.graceMs) {
      let spentHead: { count: number };
      try {
        spentHead = await this.prisma.refreshToken.updateMany({
          where: { id: head.id, isRevoked: false },
          data: { isRevoked: true },
        });
      } catch {
        return { ok: false, reason: 'unavailable', familyId: row.family };
      }
      if (spentHead.count === 1) {
        const tokens = await this.issueSuccessor(subject, row.family, meta);
        if (!tokens) return { ok: false, reason: 'unavailable', familyId: row.family };
        return { ok: true, tokens, via: 'grace' };
      }
    }

    // Outside grace, or no live head remains (logout revoked the family,
    // or the chain is exhausted): this is reuse. Revoke everything.
    await this.revokeFamily(row.family);
    return { ok: false, reason: 'reuse', familyId: row.family };
  }

  /**
   * Revoke the family that owns the presented refresh token, but only if
   * that token belongs to `userId` (the authenticated caller). Returns
   * true when a family was revoked. A token that matches no row is a
   * no-op — logout stays idempotent.
   */
  async revokeFamilyForUser(userId: string, presentedToken: string): Promise<boolean> {
    const row = (await this.prisma.refreshToken.findFirst({
      where: { token: digestRefreshToken(presentedToken), userId },
    })) as RefreshTokenRow | null;
    if (!row) return false;
    await this.revokeFamily(row.family);
    return true;
  }

  /** Revoke every live refresh token the user has (all families). */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
    return result.count;
  }

  private async findLiveHead(family: string): Promise<RefreshTokenRow | null> {
    return (await this.prisma.refreshToken.findFirst({
      where: { family, isRevoked: false, expiresAt: { gt: new Date(this.now()) } },
      orderBy: { createdAt: 'desc' },
    })) as RefreshTokenRow | null;
  }

  private async revokeFamily(family: string): Promise<void> {
    try {
      await this.prisma.refreshToken.updateMany({
        where: { family },
        data: { isRevoked: true },
      });
    } catch {
      // Best effort: the caller still fails closed with 401; a failed
      // revoke write must not turn a reuse refusal into a 500 that a
      // retry could talk its way past.
    }
  }

  private async issueSuccessor(
    subject: SessionSubject,
    familyId: string,
    meta?: RefreshSessionMeta,
  ): Promise<IssuedTokens | null> {
    try {
      const tokens = await this.issuer.issue(subject, { familyId });
      await this.registerIssuance(tokens, subject.userId, meta);
      return tokens;
    } catch {
      return null;
    }
  }
}
