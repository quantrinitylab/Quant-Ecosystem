// Shared types for the /plan surface (PR-Q6). Mirrors the backend contracts.

export interface PlanSummaryData {
  configured: boolean;
  plan: { name: string; tier: string; percentUsed: number; resetsAt: string | null };
  tokens: { percentUsed: number; remaining: number; granted: number; expiresAt: string | null };
  upgradeUrl: string | null;
}

export interface WalletData {
  configured: boolean;
  balance: { daily: number; monthly: number; purchased: number; total: number };
  history: Array<{
    id: string;
    entryType: string;
    bucket: string;
    amount: number;
    reason: string | null;
    createdAt: string;
  }>;
}

export interface CredentialGrantData {
  id: string;
  provider: string;
  accountLabel: string;
  scopes: string[];
  connectedAt: string;
}

export type ToolPolicy = 'allow' | 'ask' | 'deny';

export interface ToolPolicyData {
  id: string;
  name: string;
  description: string;
  destructive: boolean;
  policy: ToolPolicy;
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function formatResetDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
