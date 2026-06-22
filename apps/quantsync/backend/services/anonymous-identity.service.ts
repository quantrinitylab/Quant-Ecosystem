// ============================================================================
// QuantSync - Anonymous Identity Service
// ============================================================================
//
// Toggles a user's "ghost mode" (whether they post anonymously by default) and
// returns the pseudonymous identity they would post under. Backed by the
// User.ghostMode column. Pure + DI'd (prisma + alias secret) for testability.

import { createHmac } from 'node:crypto';
import type { PrismaClient } from '../types';

export interface AnonymousIdentityState {
  isAnonymous: boolean;
  anonymousAlias?: string;
}

export class AnonymousIdentityService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aliasSecret: string,
  ) {
    if (!aliasSecret) {
      throw new Error('AnonymousIdentityService requires a non-empty aliasSecret');
    }
  }

  /** The user's default anonymous alias (per-user, not tied to a thread). */
  aliasForUser(userId: string): string {
    const digest = createHmac('sha256', this.aliasSecret).update(`user:${userId}`).digest('hex');
    return `Anon-${digest.slice(0, 8)}`;
  }

  async setGhostMode(userId: string, enabled: boolean): Promise<AnonymousIdentityState> {
    await this.prisma.user.update({ where: { id: userId }, data: { ghostMode: enabled } });
    return {
      isAnonymous: enabled,
      ...(enabled ? { anonymousAlias: this.aliasForUser(userId) } : {}),
    };
  }

  async getGhostMode(userId: string): Promise<AnonymousIdentityState> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const enabled = Boolean(user?.ghostMode);
    return {
      isAnonymous: enabled,
      ...(enabled ? { anonymousAlias: this.aliasForUser(userId) } : {}),
    };
  }
}
