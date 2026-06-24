// ============================================================================
// QuantTrinity - In-memory owner control store
// ============================================================================
//
// A process-local, seeded store backing the owner control plane. It is the
// single source of truth for team accounts, the app registry, the credit
// economy, the model registry, payouts and the report queue while the
// persistent (Prisma) backing for these owner-tier concepts is being modelled.
// Mirrors the pattern used by admin's feature-flags `_store`.

import {
  type CreditConfig,
  type EcosystemApp,
  type ModelRegistryEntry,
  type OwnerReport,
  type PayoutRequest,
  type RevenueStream,
  type Sector,
  type TeamMember,
  type TeamRole,
  type PrincipalKind,
  type AiEmployeeConfig,
} from './domain';

interface TrinityState {
  team: TeamMember[];
  apps: EcosystemApp[];
  models: ModelRegistryEntry[];
  credit: CreditConfig;
  payouts: PayoutRequest[];
  revenue: RevenueStream[];
  reports: OwnerReport[];
}

const globalForTrinity = globalThis as unknown as { __trinity?: TrinityState };

function nowIso(offsetMin = 0): string {
  return new Date(Date.now() - offsetMin * 60_000).toISOString();
}

function seed(): TrinityState {
  return {
    team: [
      {
        id: 'tm-001',
        kind: 'human',
        name: 'Priya Sharma',
        email: 'priya@quant.dev',
        sector: 'moderation',
        role: 'lead',
        status: 'active',
        createdAt: nowIso(60 * 24 * 12),
      },
      {
        id: 'tm-002',
        kind: 'ai',
        name: 'QuantAI · Report Triage',
        sector: 'reporting',
        role: 'agent',
        status: 'active',
        createdAt: nowIso(60 * 24 * 5),
        ai: {
          modelId: 'or-claude-sonnet',
          autonomy: 'act-with-approval',
          dailyCreditBudget: 50,
          mandate:
            'Triage incoming user reports, label severity, resolve duplicates, escalate criticals.',
        },
      },
      {
        id: 'tm-003',
        kind: 'human',
        name: 'Arjun Mehta',
        email: 'arjun@quant.dev',
        sector: 'finance',
        role: 'analyst',
        status: 'active',
        createdAt: nowIso(60 * 24 * 30),
      },
    ],
    apps: [
      app('quantmail', 'QuantMail', 'Email + Auth + Dev hub (Gmail/GitHub)'),
      app('quantchat', 'QuantChat', 'Messaging (Snapchat/WhatsApp/Telegram)'),
      app('quantneon', 'QuantNeon', 'Photos & Reels (Instagram)'),
      app('quantmax', 'QuantMax', 'Short video + dating (TikTok/Tinder/Omegle)'),
      app('quantsync', 'QuantSync', 'Microblog + anonymous (X/Threads)'),
      app('quantube', 'QuantTube', 'Video (YouTube)'),
      app('quantedits', 'QuantEdit', 'Creative suite (CapCut/After Effects)'),
      app('quantads', 'QuantAds', 'Ad network (Meta/Google Ads)'),
      app('quantai', 'QuantAI', 'Cross-app AI assistant & device control'),
      app('quantcalendar', 'QuantCalendar', 'Calendar'),
      app('quantdrive', 'QuantDrive', 'Storage'),
      app('quantdocs', 'QuantDocs', 'Docs'),
      app('quantmeet', 'QuantMeet', 'Video meetings'),
    ],
    models: [
      model('or-claude-sonnet', 'Claude Sonnet (OpenRouter)', 'openrouter', 2.5, true, false),
      model('or-gpt-4o', 'GPT-4o (OpenRouter)', 'openrouter', 2.0, true, false),
      model('or-gemini-pro', 'Gemini Pro (OpenRouter)', 'openrouter', 1.4, true, false),
      model('local-quant-8b', 'Quant-8B (local)', 'local', 0.1, false, true),
    ],
    credit: {
      usdPerCredit: 1,
      dailyFreeCredits: 5,
      commissionRate: 0.2,
      overageEnabled: true,
    },
    payouts: [
      payout('po-001', 'NeonCreator_22', 1240, 'upi', 'pending', 30),
      payout('po-002', 'tube_arjun', 860, 'crypto', 'pending', 120),
      payout('po-003', 'editsbyriya', 430, 'stripe', 'approved', 240),
    ],
    revenue: [
      rev('rv-ads', 'QuantAds network', 184_000, 'In-app + in-game banners'),
      rev('rv-boost', 'Reel / post boosts', 62_500, 'QuantNeon, QuantMax, QuantSync'),
      rev('rv-streak', 'QuantChat streaks', 21_300, 'QuantChat'),
      rev('rv-store', 'Game store commission', 48_900, 'Quant Games digital goods'),
      rev('rv-sub', 'Subscriptions', 96_700, 'Plans across ecosystem'),
    ],
    reports: [
      report(
        'rp-001',
        'QuantNeon',
        'Spam / impersonation',
        'user_9921',
        'moderation',
        'medium',
        'open',
      ),
      report(
        'rp-002',
        'QuantSync',
        'Harassment in replies',
        'user_1180',
        'trust-safety',
        'high',
        'in-review',
      ),
      report('rp-003', 'QuantMax', 'NSFW in stream', 'user_4410', 'moderation', 'critical', 'open'),
      {
        id: 'rp-004',
        app: 'QuantChat',
        reason: 'Phishing link',
        reporter: 'user_7732',
        sector: 'reporting',
        severity: 'high',
        status: 'resolved',
        handledByAi: true,
        createdAt: nowIso(60 * 8),
      },
    ],
  };
}

function app(id: string, name: string, category: string): EcosystemApp {
  return { id, name, category, status: 'live', modelId: 'or-claude-sonnet', sidekickEnabled: true };
}
function model(
  id: string,
  label: string,
  provider: ModelRegistryEntry['provider'],
  creditPer1kTokens: number,
  enabled: boolean,
  local: boolean,
): ModelRegistryEntry {
  return { id, label, provider, creditPer1kTokens, enabled, local };
}
function payout(
  id: string,
  creatorName: string,
  credits: number,
  method: PayoutRequest['method'],
  status: PayoutRequest['status'],
  offsetMin: number,
): PayoutRequest {
  return { id, creatorName, credits, method, status, requestedAt: nowIso(offsetMin) };
}
function rev(id: string, label: string, monthlyUsd: number, source: string): RevenueStream {
  return { id, label, monthlyUsd, source };
}
function report(
  id: string,
  appName: string,
  reason: string,
  reporter: string,
  sector: Sector,
  severity: OwnerReport['severity'],
  status: OwnerReport['status'],
): OwnerReport {
  return { id, app: appName, reason, reporter, sector, severity, status, createdAt: nowIso(120) };
}

function state(): TrinityState {
  if (!globalForTrinity.__trinity) {
    globalForTrinity.__trinity = seed();
  }
  return globalForTrinity.__trinity;
}

let counter = 1000;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

// ---------------------------------------------------------------------------
// Team / sectors / AI-as-employee
// ---------------------------------------------------------------------------

export function listTeam(sector?: Sector): TeamMember[] {
  const team = state().team;
  return sector ? team.filter((m) => m.sector === sector) : team;
}

export interface CreateTeamMemberInput {
  kind: PrincipalKind;
  name: string;
  email?: string;
  sector: Sector;
  role: TeamRole;
  ai?: AiEmployeeConfig;
}

export function createTeamMember(input: CreateTeamMemberInput): TeamMember {
  const member: TeamMember = {
    id: nextId('tm'),
    kind: input.kind,
    name: input.name,
    email: input.kind === 'human' ? input.email : undefined,
    sector: input.sector,
    role: input.role,
    status: input.kind === 'human' ? 'invited' : 'active',
    createdAt: new Date().toISOString(),
    ai: input.kind === 'ai' ? input.ai : undefined,
  };
  state().team.unshift(member);
  return member;
}

export function updateTeamMember(
  id: string,
  patch: Partial<Pick<TeamMember, 'sector' | 'role' | 'status'>> & { ai?: AiEmployeeConfig },
): TeamMember | null {
  const member = state().team.find((m) => m.id === id);
  if (!member) return null;
  if (patch.sector) member.sector = patch.sector;
  if (patch.role) member.role = patch.role;
  if (patch.status) member.status = patch.status;
  if (patch.ai && member.kind === 'ai') member.ai = patch.ai;
  return member;
}

// ---------------------------------------------------------------------------
// App registry control
// ---------------------------------------------------------------------------

export function listApps(): EcosystemApp[] {
  return state().apps;
}

export function updateApp(
  id: string,
  patch: Partial<Pick<EcosystemApp, 'status' | 'modelId' | 'sidekickEnabled'>>,
): EcosystemApp | null {
  const a = state().apps.find((x) => x.id === id);
  if (!a) return null;
  if (patch.status) a.status = patch.status;
  if (patch.modelId) a.modelId = patch.modelId;
  if (typeof patch.sidekickEnabled === 'boolean') a.sidekickEnabled = patch.sidekickEnabled;
  return a;
}

// ---------------------------------------------------------------------------
// Economy: credits, models, payouts, revenue
// ---------------------------------------------------------------------------

export function getCreditConfig(): CreditConfig {
  return state().credit;
}
export function updateCreditConfig(patch: Partial<CreditConfig>): CreditConfig {
  const c = state().credit;
  Object.assign(c, patch);
  return c;
}

export function listModels(): ModelRegistryEntry[] {
  return state().models;
}
export function updateModel(
  id: string,
  patch: Partial<Pick<ModelRegistryEntry, 'enabled' | 'local' | 'creditPer1kTokens'>>,
): ModelRegistryEntry | null {
  const m = state().models.find((x) => x.id === id);
  if (!m) return null;
  Object.assign(m, patch);
  return m;
}

export function listPayouts(): PayoutRequest[] {
  return state().payouts;
}
export function updatePayout(id: string, status: PayoutRequest['status']): PayoutRequest | null {
  const p = state().payouts.find((x) => x.id === id);
  if (!p) return null;
  p.status = status;
  return p;
}

export function listRevenue(): RevenueStream[] {
  return state().revenue;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function listReports(sector?: Sector): OwnerReport[] {
  const reports = state().reports;
  return sector ? reports.filter((r) => r.sector === sector) : reports;
}
export function updateReport(id: string, status: OwnerReport['status']): OwnerReport | null {
  const r = state().reports.find((x) => x.id === id);
  if (!r) return null;
  r.status = status;
  return r;
}
