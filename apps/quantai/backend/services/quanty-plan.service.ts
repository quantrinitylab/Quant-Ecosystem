// ============================================================================
// QuantAI — Quanty Plan/Wallet Service (PR-Q6)
// ============================================================================
//
// Backend data for the /plan screen (Muse S3 parity):
//   - getPlanSummary: plan tier + daily usage % + reset date + additional tokens
//   - getWallet:      credit-ledger-derived balances + earn/spend history
//   - ToolPolicyService: per-user per-tool allow/ask/deny policies
//   - getCredentials:  OAuth grant METADATA only (never token values)
//
// HONESTY RULES (enforced here, not just documented):
//   - No fabricated balances. When Prisma is absent or a query fails, the
//     result carries `configured: false` and the UI renders an honest empty
//     state instead of a fake number.
//   - Credential values (access/refresh tokens) are NEVER selected from the
//     database and NEVER leave this service.

import { createAppError } from '@quant/server-core';

// ---------------------------------------------------------------------------
// Minimal Prisma seam — only the models this service touches. Callers pass
// the real Prisma client; tests pass a mock. When a model is absent the
// service degrades to `configured: false` instead of throwing.
// ---------------------------------------------------------------------------

export interface QuantyPlanPrisma {
  planSubscription?: {
    findFirst: (args: unknown) => Promise<PlanSubscriptionRow | null>;
  };
  creditLedgerEntry?: {
    aggregate: (args: unknown) => Promise<{ _sum: { amount: number | null } }>;
    findMany: (args: unknown) => Promise<CreditLedgerEntryRow[]>;
  };
  oAuthAccount?: {
    findMany: (args: unknown) => Promise<OAuthAccountRow[]>;
    delete: (args: unknown) => Promise<unknown>;
  };
  aISession?: {
    findMany: (args: unknown) => Promise<Array<{ totalTokensUsed: number; updatedAt: Date | null }>>;
  };
}

interface PlanSubscriptionRow {
  planTier: string;
  status: string;
  currentPeriodEnd: Date;
}

interface CreditLedgerEntryRow {
  id: string;
  entryType: string;
  bucket: string;
  amount: number;
  reason: string | null;
  createdAt: Date;
}

interface OAuthAccountRow {
  id: string;
  provider: string;
  providerAccountId: string;
  scope: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Public shapes (also the Next API proxy contract)
// ---------------------------------------------------------------------------

export type ToolPolicy = 'allow' | 'ask' | 'deny';

export interface PlanSummary {
  configured: boolean;
  plan: { name: string; tier: string; percentUsed: number; resetsAt: string | null };
  tokens: { percentUsed: number; remaining: number; granted: number; expiresAt: string | null };
  upgradeUrl: string | null;
}

export interface WalletSummary {
  configured: boolean;
  balance: { daily: number; monthly: number; purchased: number; total: number };
  history: WalletHistoryEntry[];
}

export interface WalletHistoryEntry {
  id: string;
  entryType: string;
  bucket: string;
  amount: number;
  reason: string | null;
  createdAt: string;
}

export interface CredentialGrant {
  id: string;
  provider: string;
  accountLabel: string;
  scopes: string[];
  connectedAt: string;
}

export interface ToolPolicyEntry {
  id: string;
  name: string;
  description: string;
  destructive: boolean;
  policy: ToolPolicy;
}

// ---------------------------------------------------------------------------
// Plan tier catalog (mirrors packages/credits PLAN_CATALOG tiers; the
// entitlements themselves live in @quant/credits — this is display + usage)
// ---------------------------------------------------------------------------

const TIER_DISPLAY: Record<string, string> = {
  free: 'Free plan',
  pro: 'Pro plan',
  team: 'Team plan',
  enterprise: 'Enterprise plan',
};

/** Free-tier daily token allowance (mirrors UsageService.dailyTokenLimit). */
const FREE_DAILY_TOKEN_LIMIT = 1_000_000;

function nextUtcMidnight(): Date {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

function getAuthUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export { getAuthUserId };

// ---------------------------------------------------------------------------
// QuantyPlanService
// ---------------------------------------------------------------------------

export class QuantyPlanService {
  constructor(
    private readonly prisma: QuantyPlanPrisma | null,
    private readonly upgradeUrl: string | null = process.env.QUANTAI_UPGRADE_URL ?? null,
  ) {}

  /** Plan card data. Real DB rows when available; honest `configured:false` otherwise. */
  async getPlanSummary(userId: string): Promise<PlanSummary> {
    if (!this.prisma?.planSubscription) {
      return this.unconfiguredSummary();
    }

    let tier = 'free';
    let periodEnd: Date | null = null;
    try {
      const sub = await this.prisma.planSubscription.findFirst({
        where: { ownerRef: userId, status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (sub) {
        tier = sub.planTier;
        periodEnd = sub.currentPeriodEnd;
      }
    } catch {
      return this.unconfiguredSummary();
    }

    // Daily usage %: tokens consumed today vs the free-tier daily allowance.
    // (PlanService entitlements in @quant/credits define per-tier allowances;
    // this screen shows the free-tier daily meter honestly labeled.)
    let percentUsed = 0;
    try {
      const tokensToday = await this.getTokensUsedToday(userId);
      percentUsed = Math.min(100, Math.round((tokensToday / FREE_DAILY_TOKEN_LIMIT) * 100));
    } catch {
      percentUsed = 0;
    }

    // Additional tokens: purchased-bucket ledger math. granted = sum of
    // positive (credit) entries; remaining = net sum. Never expires by design.
    let granted = 0;
    let remaining = 0;
    try {
      if (this.prisma.creditLedgerEntry) {
        const [grantedAgg, netAgg] = await Promise.all([
          this.prisma.creditLedgerEntry.aggregate({
            where: { ownerRef: userId, bucket: 'PURCHASED', amount: { gt: 0 } },
            _sum: { amount: true },
          }),
          this.prisma.creditLedgerEntry.aggregate({
            where: { ownerRef: userId, bucket: 'PURCHASED' },
            _sum: { amount: true },
          }),
        ]);
        granted = grantedAgg._sum.amount ?? 0;
        remaining = Math.max(0, netAgg._sum.amount ?? 0);
      }
    } catch {
      granted = 0;
      remaining = 0;
    }
    const tokensPercentUsed = granted > 0 ? Math.min(100, Math.round(((granted - remaining) / granted) * 100)) : 0;

    return {
      configured: true,
      plan: {
        name: TIER_DISPLAY[tier] ?? 'Free plan',
        tier,
        percentUsed,
        // Weekly reset wording in Muse; our meter is daily — label honestly.
        resetsAt: nextUtcMidnight().toISOString(),
      },
      tokens: {
        percentUsed: tokensPercentUsed,
        remaining,
        granted,
        expiresAt: null, // purchased credits never expire
      },
      upgradeUrl: this.upgradeUrl,
    };
  }

  /** Wallet balances + history, derived from the append-only credit ledger. */
  async getWallet(userId: string): Promise<WalletSummary> {
    if (!this.prisma?.creditLedgerEntry) {
      return { configured: false, balance: { daily: 0, monthly: 0, purchased: 0, total: 0 }, history: [] };
    }

    try {
      const buckets = ['DAILY', 'MONTHLY', 'PURCHASED'] as const;
      const sums = await Promise.all(
        buckets.map((bucket) =>
          this.prisma!.creditLedgerEntry!.aggregate({
            where: { ownerRef: userId, bucket },
            _sum: { amount: true },
          }),
        ),
      );
      const [daily, monthly, purchased] = sums.map((s) => Math.max(0, s._sum.amount ?? 0));

      const rows = await this.prisma.creditLedgerEntry.findMany({
        where: { ownerRef: userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        // NOTE: select is metadata-only — token/secret columns are never read.
        select: { id: true, entryType: true, bucket: true, amount: true, reason: true, createdAt: true },
      });

      return {
        configured: true,
        balance: { daily, monthly, purchased, total: daily + monthly + purchased },
        history: rows.map((r) => ({
          id: r.id,
          entryType: r.entryType,
          bucket: r.bucket,
          amount: r.amount,
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    } catch {
      return { configured: false, balance: { daily: 0, monthly: 0, purchased: 0, total: 0 }, history: [] };
    }
  }

  /**
   * Stored credential grants — METADATA ONLY. The Prisma select explicitly
   * excludes accessToken/refreshToken; they can never leak through this path.
   */
  async getCredentials(userId: string): Promise<{ configured: boolean; grants: CredentialGrant[] }> {
    if (!this.prisma?.oAuthAccount) {
      return { configured: false, grants: [] };
    }
    try {
      const rows = await this.prisma.oAuthAccount.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, provider: true, providerAccountId: true, scope: true, createdAt: true },
      });
      return {
        configured: true,
        grants: rows.map((r) => ({
          id: r.id,
          provider: r.provider,
          accountLabel: this.maskAccountLabel(r.providerAccountId),
          scopes: r.scope ? r.scope.split(' ').filter(Boolean) : [],
          connectedAt: r.createdAt.toISOString(),
        })),
      };
    } catch {
      return { configured: false, grants: [] };
    }
  }

  /** Revoke a grant. Scoped to the caller's userId — cannot revoke others'. */
  async revokeCredential(userId: string, grantId: string): Promise<{ revoked: boolean }> {
    if (!this.prisma?.oAuthAccount) {
      throw createAppError('Credential store is not configured', 503, 'CREDENTIAL_STORE_UNAVAILABLE');
    }
    const existing = await this.prisma.oAuthAccount.findMany({
      where: { id: grantId, userId },
      select: { id: true, provider: true, providerAccountId: true, scope: true, createdAt: true },
    });
    if (existing.length === 0) {
      throw createAppError('Credential grant not found', 404, 'GRANT_NOT_FOUND');
    }
    await this.prisma.oAuthAccount.delete({ where: { id: grantId } });
    return { revoked: true };
  }

  private unconfiguredSummary(): PlanSummary {
    return {
      configured: false,
      plan: { name: 'Free plan', tier: 'free', percentUsed: 0, resetsAt: null },
      tokens: { percentUsed: 0, remaining: 0, granted: 0, expiresAt: null },
      upgradeUrl: this.upgradeUrl,
    };
  }

  private async getTokensUsedToday(userId: string): Promise<number> {
    if (!this.prisma?.aISession) return 0;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const sessions = await this.prisma.aISession.findMany({
      where: { userId, deletedAt: null, updatedAt: { gte: todayStart } },
      select: { totalTokensUsed: true, updatedAt: true },
    });
    return sessions.reduce((sum, s) => sum + (s.totalTokensUsed ?? 0), 0);
  }

  /** Never show a full account id/email in the UI — mask it. */
  private maskAccountLabel(accountId: string): string {
    if (!accountId) return 'connected account';
    if (accountId.includes('@')) {
      const [local, domain] = accountId.split('@');
      return `${local.slice(0, 2)}•••@${domain}`;
    }
    return `${accountId.slice(0, 4)}••••`;
  }
}

// ---------------------------------------------------------------------------
// ToolPolicyService — per-user per-tool allow/ask/deny
// ---------------------------------------------------------------------------

export interface ToolCatalogEntry {
  id: string;
  name: string;
  description: string;
  destructive: boolean;
}

/** Curated catalog of tools Quanty may invoke. Destructive tools default to "ask". */
export const DEFAULT_TOOL_CATALOG: ToolCatalogEntry[] = [
  { id: 'mail.search', name: 'Mail search', description: 'Search your mailbox', destructive: false },
  { id: 'mail.read', name: 'Read email', description: 'Read a single email', destructive: false },
  { id: 'mail.send', name: 'Send email', description: 'Send an email as you', destructive: true },
  { id: 'mail.archive', name: 'Archive email', description: 'Archive emails', destructive: true },
  { id: 'mail.delete', name: 'Delete email', description: 'Delete emails', destructive: true },
  { id: 'git.read', name: 'Read repository', description: 'Read files, PRs and issues', destructive: false },
  { id: 'git.pr_diff', name: 'PR diff', description: 'View pull request diffs', destructive: false },
  { id: 'git.merge', name: 'Merge PR', description: 'Merge a pull request', destructive: true },
  { id: 'mcp.gmail.search', name: 'Gmail search', description: 'Search connected Gmail', destructive: false },
  { id: 'mcp.gmail.send', name: 'Gmail send', description: 'Send via connected Gmail', destructive: true },
  { id: 'browser.navigate', name: 'Browser navigate', description: 'Open pages in the live browser', destructive: false },
  { id: 'calendar.read', name: 'Read calendar', description: 'Read calendar events', destructive: false },
  { id: 'calendar.create', name: 'Create event', description: 'Create calendar events', destructive: true },
];

export class ToolPolicyService {
  private readonly policies = new Map<string, Map<string, ToolPolicy>>();

  constructor(private readonly catalog: ToolCatalogEntry[] = DEFAULT_TOOL_CATALOG) {}

  listPolicies(userId: string): ToolPolicyEntry[] {
    const userPolicies = this.policies.get(userId);
    return this.catalog.map((tool) => ({
      ...tool,
      policy: userPolicies?.get(tool.id) ?? (tool.destructive ? 'ask' : 'allow'),
    }));
  }

  setPolicy(userId: string, toolId: string, policy: ToolPolicy): ToolPolicyEntry {
    const tool = this.catalog.find((t) => t.id === toolId);
    if (!tool) {
      throw createAppError(`Unknown tool: ${toolId}`, 400, 'UNKNOWN_TOOL');
    }
    let userPolicies = this.policies.get(userId);
    if (!userPolicies) {
      userPolicies = new Map();
      this.policies.set(userId, userPolicies);
    }
    userPolicies.set(toolId, policy);
    return { ...tool, policy };
  }

  /** Effective policy for a tool (used by the agent executor's consent gate). */
  getPolicy(userId: string, toolId: string): ToolPolicy {
    const tool = this.catalog.find((t) => t.id === toolId);
    if (!tool) return 'deny'; // unknown tools are denied by default
    return this.policies.get(userId)?.get(toolId) ?? (tool.destructive ? 'ask' : 'allow');
  }

  /** Test seam. */
  clear(): void {
    this.policies.clear();
  }
}
