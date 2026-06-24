// ============================================================================
// QuantTrinity - Owner-tier domain model
// ============================================================================
//
// These are the concepts the OWNER governs from QuantTrinity. They sit above
// the operational `admin` app: provisioning team accounts, assigning sectors &
// roles, placing AI agents as "employees", and governing the ecosystem economy
// and AI model registry.

/** Operational sectors the owner can delegate work to. */
export const SECTORS = [
  'reporting',
  'moderation',
  'support',
  'finance',
  'growth',
  'engineering',
  'trust-safety',
] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_LABEL: Record<Sector, string> = {
  reporting: 'Reporting',
  moderation: 'Moderation',
  support: 'Support',
  finance: 'Finance & Payouts',
  growth: 'Growth',
  engineering: 'Engineering',
  'trust-safety': 'Trust & Safety',
};

/** Role within a sector. */
export const TEAM_ROLES = ['lead', 'analyst', 'agent', 'viewer'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/**
 * A team member is either a HUMAN account or an AI agent acting as an employee.
 * AI employees run autonomously inside their sector (e.g. triaging the
 * reporting queue daily) under the owner's spending/permission limits.
 */
export type PrincipalKind = 'human' | 'ai';

export interface AiEmployeeConfig {
  /** Model the AI employee runs on (from the model registry). */
  modelId: string;
  /** Autonomy level for actions it may take without owner approval. */
  autonomy: 'suggest' | 'act-with-approval' | 'autonomous';
  /** Daily credit budget the AI employee may consume. */
  dailyCreditBudget: number;
  /** Short description of the standing task it performs. */
  mandate: string;
}

export interface TeamMember {
  id: string;
  kind: PrincipalKind;
  name: string;
  /** Present for human members. */
  email?: string;
  sector: Sector;
  role: TeamRole;
  status: 'active' | 'suspended' | 'invited';
  createdAt: string;
  /** Present only when kind === 'ai'. */
  ai?: AiEmployeeConfig;
}

/** A registered ecosystem app the owner can control. */
export interface EcosystemApp {
  id: string;
  name: string;
  /** Consumer category the app competes in. */
  category: string;
  status: 'live' | 'maintenance' | 'disabled';
  /** Default AI model assigned to this app's automations. */
  modelId: string;
  /** Whether the QuantAI sidekick is enabled in this app. */
  sidekickEnabled: boolean;
}

/** AI model the ecosystem can route to (via OpenRouter today, local later). */
export interface ModelRegistryEntry {
  id: string;
  label: string;
  provider: 'openrouter' | 'local' | 'anthropic' | 'openai' | 'google';
  /** Cost in credits per 1K output tokens (1 credit == 1 USD target). */
  creditPer1kTokens: number;
  enabled: boolean;
  /** True once migrated to a self-hosted/local weight for margin. */
  local: boolean;
}

/** Owner-controlled credit economy configuration. */
export interface CreditConfig {
  /** USD value of one credit. */
  usdPerCredit: number;
  /** Free daily credit allowance granted to every user. */
  dailyFreeCredits: number;
  /** Platform commission on creator/seller earnings (0..1). */
  commissionRate: number;
  /** Whether overage (paid usage past the free tier) is globally allowed. */
  overageEnabled: boolean;
}

export type WithdrawalMethod = 'upi' | 'stripe' | 'paypal' | 'crypto';

export interface PayoutRequest {
  id: string;
  creatorName: string;
  credits: number;
  method: WithdrawalMethod;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  requestedAt: string;
}

export interface RevenueStream {
  id: string;
  label: string;
  /** Monthly revenue in USD. */
  monthlyUsd: number;
  source: string;
}

/** A user report routed to a sector queue. */
export interface OwnerReport {
  id: string;
  app: string;
  reason: string;
  reporter: string;
  sector: Sector;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in-review' | 'resolved';
  /** Set when an AI employee handled it. */
  handledByAi?: boolean;
  createdAt: string;
}

/** A recorded owner control-plane action (the owner audit trail). */
export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail?: string;
}

/** A user as surfaced to the owner oversight view (subset of the User model). */
export interface OversightUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
  level: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ApiOk<T> {
  success: true;
  data: T;
}
export interface ApiErr {
  success: false;
  error: { message: string; code: string };
}
export type ApiResult<T> = ApiOk<T> | ApiErr;
