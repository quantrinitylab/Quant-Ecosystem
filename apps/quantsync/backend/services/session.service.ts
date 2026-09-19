import { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';

/**
 * QuantWave session lifecycle.
 *
 * QuantWave is **not** an identity issuer: QuantMail is the ecosystem's identity root and the
 * QuantMail access token *is* the session credential (see `sso-login.service.ts`). That shapes
 * what each endpoint can honestly do:
 *
 * - `GET  /auth/session` — project the verified token claims and join the live DB profile.
 * - `POST /auth/refresh` — re-validate the presented token as a cross-app token. QuantWave
 *   cannot mint a longer-lived one, so a genuinely expired token must send the client back to
 *   QuantMail rather than being silently renewed here.
 * - `POST /auth/logout`  — drop the server-side `Session` row for this token when one exists.
 *
 * Ghost mode is a durable user preference, so logout deliberately leaves it untouched.
 */

export interface SessionIdentity {
  userId: string;
  email: string;
  username: string;
  role: string;
  scopes: string[];
  sessionId: string;
  app: string;
}

export interface SessionProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  ghostMode: boolean;
}

export class SessionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Resolve the current session.
   *
   * The token was already cryptographically verified by the global auth hook, so this adds the
   * parts that only the database knows: the current profile, and the stored expiry when a
   * `Session` row is tracking this token.
   */
  async getSession(
    identity: SessionIdentity,
    token?: string,
  ): Promise<{
    authenticated: true;
    identity: SessionIdentity;
    user: SessionProfile | null;
    expiresAt: Date | null;
  }> {
    if (!identity.userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const [user, session] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: identity.userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isVerified: true,
          ghostMode: true,
          deletedAt: true,
        },
      }),
      token
        ? this.prisma.session.findUnique({ where: { token }, select: { expiresAt: true } })
        : Promise.resolve(null),
    ]);

    // A token can outlive its account: reject rather than reporting a live session for a
    // user row that has been soft-deleted.
    if (user?.deletedAt) {
      throw createAppError('Account is no longer active', 401, 'ACCOUNT_INACTIVE');
    }

    const profile: SessionProfile | null = user
      ? {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          isVerified: user.isVerified,
          ghostMode: user.ghostMode,
        }
      : null;

    return {
      authenticated: true,
      identity,
      user: profile,
      expiresAt: session?.expiresAt ?? null,
    };
  }

  /**
   * Revoke the server-side session for `token`.
   *
   * Returns `revoked: false` when no row matched — the caller still succeeds, because the
   * client-side outcome (discard the credential) is the same and logout must be idempotent.
   */
  async logout(token?: string): Promise<{ revoked: boolean }> {
    if (!token) return { revoked: false };
    try {
      await this.prisma.session.delete({ where: { token } });
      return { revoked: true };
    } catch {
      // No session row for this token (stateless QuantMail credential, or already gone).
      return { revoked: false };
    }
  }
}
