// ============================================================================
// Quanty agent — MCP connection store (production, Prisma-backed)
// ============================================================================
//
// PURPOSE
//   Production implementation of the prototype's GmailGrantStore seam backed
//   by the `mcp_connections` / `mcp_grant_audit` tables (migration 0075).
//
//   - Encrypted refresh tokens are stored per (userId, provider).
//   - Every lifecycle event (connect/disconnect/test/refresh outcome) writes
//     an audit row — tokens, codes and secrets NEVER appear in audit detail.
//   - The `enabled` flag is the per-connection kill switch the tool registry
//     consults before exposing `mcp.<provider>.*` tools to the agent.
//
// SECURITY
//   * This store handles opaque encrypted blobs only. Encryption/decryption
//     lives in the TokenCipher (see gmail/gmail-oauth.ts); plaintext tokens
//     are never persisted, logged, or returned by this store.
//   * All reads are (userId, provider)-scoped — no cross-user access.

import type { GmailGrantStore, StoredGmailGrant } from './gmail/gmail-oauth';

/** Minimal Prisma surface this store needs (keeps unit tests mock-light). */
export interface McpConnectionPrisma {
  mcpConnection: {
    upsert(args: {
      where: { userId_provider: { userId: string; provider: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
    findUnique(args: {
      where: { userId_provider: { userId: string; provider: string } };
    }): Promise<McpConnectionRow | null>;
    delete(args: {
      where: { userId_provider: { userId: string; provider: string } };
    }): Promise<unknown>;
    findMany(args: {
      where: { userId: string };
      select?: Record<string, boolean>;
      orderBy?: Record<string, string>;
    }): Promise<McpConnectionRow[]>;
    update(args: {
      where: { userId_provider: { userId: string; provider: string } };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
  mcpGrantAudit: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface McpConnectionRow {
  id: string;
  userId: string;
  provider: string;
  status: string;
  encryptedTokens: string;
  scopes: string[];
  accountEmail: string | null;
  accountLabel: string | null;
  enabled: boolean;
  connectedAt: Date;
  lastRefreshedAt: Date | null;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Grant lifecycle events written to `mcp_grant_audit`. */
export type McpGrantEvent =
  | 'connected'
  | 'disconnected'
  | 'test_ok'
  | 'test_failed'
  | 'token_refreshed'
  | 'refresh_failed'
  | 'revoked'
  | 'disabled'
  | 'enabled';

export class PrismaMcpConnectionStore {
  constructor(
    private readonly prisma: McpConnectionPrisma,
    private readonly provider: string = 'gmail',
  ) {}

  /** Persist (or replace) the encrypted grant for a user. Upsert keeps exactly one row per (user, provider). */
  async saveGrant(input: {
    userId: string;
    encryptedTokens: string;
    scopes: string[];
    accountEmail?: string;
    accountLabel?: string;
  }): Promise<void> {
    const { userId, encryptedTokens, scopes, accountEmail, accountLabel } = input;
    await this.prisma.mcpConnection.upsert({
      where: { userId_provider: { userId, provider: this.provider } },
      create: {
        userId,
        provider: this.provider,
        status: 'connected',
        encryptedTokens,
        scopes,
        accountEmail: accountEmail ?? null,
        accountLabel: accountLabel ?? null,
        enabled: true,
      },
      update: {
        status: 'connected',
        encryptedTokens,
        scopes,
        accountEmail: accountEmail ?? null,
        accountLabel: accountLabel ?? null,
        enabled: true,
      },
    });
  }

  /** Fetch the stored grant row (encrypted blob only — never plaintext). */
  async getGrant(userId: string): Promise<McpConnectionRow | null> {
    return this.prisma.mcpConnection.findUnique({
      where: { userId_provider: { userId, provider: this.provider } },
    });
  }

  /** True when the user has a connected + enabled grant for this provider. */
  async isConnected(userId: string): Promise<boolean> {
    const row = await this.getGrant(userId);
    return !!row && row.status === 'connected' && row.enabled;
  }

  /** Revoke: delete the grant row entirely (tokens are unrecoverable afterwards). */
  async revoke(userId: string): Promise<boolean> {
    const existing = await this.getGrant(userId);
    if (!existing) return false;
    await this.prisma.mcpConnection.delete({
      where: { userId_provider: { userId, provider: this.provider } },
    });
    return true;
  }

  /** Flip the per-connection kill switch without deleting the grant. */
  async setEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.prisma.mcpConnection.update({
      where: { userId_provider: { userId, provider: this.provider } },
      data: { enabled },
    });
  }

  /** Record a connectivity-test outcome on the grant row. */
  async recordTest(userId: string, ok: boolean): Promise<void> {
    await this.prisma.mcpConnection.update({
      where: { userId_provider: { userId, provider: this.provider } },
      data: { lastTestedAt: new Date(), lastTestOk: ok },
    });
  }

  /** List a user's connections (safe fields only — encrypted blob excluded). */
  async listConnections(userId: string): Promise<
    Array<{
      provider: string;
      status: string;
      enabled: boolean;
      scopes: string[];
      accountEmail: string | null;
      accountLabel: string | null;
      connectedAt: Date;
      lastTestedAt: Date | null;
      lastTestOk: boolean | null;
    }>
  > {
    const rows = await this.prisma.mcpConnection.findMany({
      where: { userId },
      select: {
        provider: true,
        status: true,
        enabled: true,
        scopes: true,
        accountEmail: true,
        accountLabel: true,
        connectedAt: true,
        lastTestedAt: true,
        lastTestOk: true,
      },
      orderBy: { connectedAt: 'desc' },
    });
    return rows.map((r) => ({
      provider: r.provider,
      status: r.status,
      enabled: r.enabled,
      scopes: r.scopes,
      accountEmail: r.accountEmail,
      accountLabel: r.accountLabel,
      connectedAt: r.connectedAt,
      lastTestedAt: r.lastTestedAt,
      lastTestOk: r.lastTestOk,
    }));
  }

  /** Write an audit row. `detail` must never contain tokens/codes/secrets. */
  async audit(input: {
    userId: string;
    event: McpGrantEvent;
    detail?: string;
    ipAddress?: string;
    provider?: string;
  }): Promise<void> {
    await this.prisma.mcpGrantAudit.create({
      data: {
        userId: input.userId,
        provider: input.provider ?? this.provider,
        event: input.event,
        detail: input.detail ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }
}

/**
 * Adapter: expose the Prisma store through the prototype's GmailGrantStore
 * seam so GmailOAuth works unchanged against production storage.
 */
export class PrismaGmailGrantStore implements GmailGrantStore {
  private readonly store: PrismaMcpConnectionStore;

  constructor(prisma: McpConnectionPrisma) {
    this.store = new PrismaMcpConnectionStore(prisma, 'gmail');
  }

  /** Expose the underlying store for routes that need audit/enabled/test. */
  get mcp(): PrismaMcpConnectionStore {
    return this.store;
  }

  async save(grant: StoredGmailGrant): Promise<void> {
    await this.store.saveGrant({
      userId: grant.userId,
      encryptedTokens: grant.encryptedRefreshToken,
      scopes: grant.scope ? grant.scope.split(' ') : [],
      accountEmail: grant.accountEmail,
    });
  }

  async get(userId: string): Promise<StoredGmailGrant | null> {
    const row = await this.store.getGrant(userId);
    if (!row || row.status !== 'connected') return null;
    return {
      userId: row.userId,
      encryptedRefreshToken: row.encryptedTokens,
      scope: row.scopes.join(' '),
      accountEmail: row.accountEmail ?? undefined,
      connectedAt: row.connectedAt.toISOString(),
      lastRefreshedAt: row.lastRefreshedAt?.toISOString(),
    };
  }

  async delete(userId: string): Promise<void> {
    await this.store.revoke(userId);
  }
}
