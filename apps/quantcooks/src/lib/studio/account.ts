// ============================================================================
// QuantCooks Studio — Account / Credits / Profile view models
// (Phase 2 Unit 10, checklist group K rows #65–#68; specs §10; CP-1 §3.7/§6)
//
// The honesty design of this unit is structural, the same way Unit 7 made a
// persona impossible to mark "trained" client-side:
//
//  * The Quant Credits LEDGER read is wired by CP-2: the backend's
//    CreditsExecutionPort (the @quant/credits wallet behind CP-1's
//    tools) makes quantcooks.get_credit_balance / list_credit_history
//    return real ledger state where a ledger is configured, and the
//    executors still return 503 CREDITS_NOT_CONFIGURED where it is not
//    — "a fabricated balance is the one output this tool must never
//    produce". The types below keep that honesty structural: the
//    not-configured balance view has NO numeric field at all, and the
//    numeric view exists only on the 'connected' connection, which the
//    page builds solely from a successful tool response (see
//    connectionFromBalanceInvoke — a refusal can never become a number).
//  * What IS real today is job activity: P0-4 export jobs and C-2
//    EffectCraft renders are real backend records with real list/get
//    reads. The Usage view is built from those records, and every credit
//    figure on it is the figure the backend recorded — exports record no
//    charge (null in the unified job shape, jobs.ts), craft renders
//    record creditCost with metering: 'not_wired'. Both are displayed
//    verbatim, never rounded into a charge that did not happen.
//  * Identity: the client's auth surface (providers/auth-provider.tsx)
//    exposes only isAuthenticated — there is NO client read of the
//    caller's name, email, avatar, or Quant Account id anywhere in this
//    app today. The identity view below is therefore an unavailable
//    state with the follow-up named, not a placeholder profile.
//  * Publishing: ServerProject carries no publish/visibility field and
//    updateProject accepts only { name, type } — there is no publish
//    flag for quantcooks.update_project to flip yet (G-17). The profile
//    grid's Publish action is modelled as unavailable-with-reason, never
//    as a button that pretends to work.
// ============================================================================

import type { ServerCraftRenderJob, ServerExportJob, ServerProject } from '../../services/api-client';

// ---------------------------------------------------------------------------
// Account shell panels (checklist row #65 — the studied manage-account nav)
// ---------------------------------------------------------------------------

export type AccountPanelId =
  | 'profile'
  | 'credits'
  | 'usage'
  | 'brand-defaults'
  | 'promocode'
  | 'danger-zone';

export interface AccountPanel {
  id: AccountPanelId;
  label: string;
}

export const ACCOUNT_PANELS: AccountPanel[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'credits', label: 'Credits & Plan' },
  { id: 'usage', label: 'Usage' },
  { id: 'brand-defaults', label: 'Brand Defaults' },
  { id: 'promocode', label: 'Promocode' },
  { id: 'danger-zone', label: 'Danger Zone' },
];

export function isAccountPanelId(value: unknown): value is AccountPanelId {
  return typeof value === 'string' && ACCOUNT_PANELS.some((p) => p.id === value);
}

// ---------------------------------------------------------------------------
// Credits — twins, standing rules, and the (single-state) ledger connection
// ---------------------------------------------------------------------------

export const CREDIT_TOOLS = {
  balance: 'quantcooks.get_credit_balance',
  history: 'quantcooks.list_credit_history',
  quote: 'quantcooks.get_credit_quote',
} as const;

export interface CreditRule {
  id: 'no-expiry' | 'auto-refund' | 'one-rule' | 'no-upsell';
  title: string;
  text: string;
}

/**
 * The anti-complaint standing rules (specs §10.2). These are the product's
 * published rules for how Quant Credits behave in QuantCooks — stated as
 * product commitments, the opposite mechanics of the reference product's
 * complaint themes (expiry, refund fights, per-surface pricing). They are
 * copy about the rules, never a claim about a live balance.
 */
export const CREDIT_RULES: CreditRule[] = [
  {
    id: 'no-expiry',
    title: 'Credits do not expire',
    text: 'Quant Credits you hold stay yours. No timer quietly deletes them, and no pack silently lapses.',
  },
  {
    id: 'auto-refund',
    title: 'Failed jobs are never charged',
    text: 'Every paid run is quoted, then held, then settled only when it completes. If a job fails, the hold is released in full and the job shows as refunded — you were never charged for work that did not happen.',
  },
  {
    id: 'one-rule',
    title: 'One price on every surface',
    text: 'The same action costs the same on the web, in QuantAI chat, over MCP and from the CLI. There is no surface where your credits silently do not apply.',
  },
  {
    id: 'no-upsell',
    title: 'No upsell walls in your flow',
    text: 'The price sits on the Generate button before anything runs. Nothing pops up mid-job to sell you a bigger plan.',
  },
];

/** The balance shape CP-1 §3.7 tool 32 returns (the port's getBalance). */
export interface LedgerBalance {
  daily: number;
  monthly: number;
  purchased: number;
  total: number;
  /** Credits held by this process's open reservations (not yet settled). */
  held: number;
}

/**
 * The ledger connection, as the page learns it from the real tool read
 * (CP-2). 'connected' — carrying the balance — is constructible only
 * from a successful get_credit_balance response; a CREDITS_NOT_CONFIGURED
 * refusal maps to 'not_configured', and any other failure maps to
 * 'error' with its real code/message rather than masquerading as either
 * of the other two states.
 */
export type LedgerConnection =
  | { status: 'not_configured'; code: 'CREDITS_NOT_CONFIGURED' }
  | { status: 'loading' }
  | { status: 'connected'; balance: LedgerBalance }
  | { status: 'error'; code: string; message: string };

export const LEDGER_CONNECTION: LedgerConnection = {
  status: 'not_configured',
  code: 'CREDITS_NOT_CONFIGURED',
};

/**
 * What the Credits panel may render about the balance. The
 * not-configured variant still has NO numeric field — a balance number
 * cannot be rendered from it because it cannot be represented; numbers
 * exist only on the 'ready' variant, derived from a 'connected'
 * connection.
 */
export type LedgerBalanceView =
  | { kind: 'not_configured'; code: 'CREDITS_NOT_CONFIGURED'; tool: typeof CREDIT_TOOLS.balance }
  | { kind: 'loading'; tool: typeof CREDIT_TOOLS.balance }
  | ({ kind: 'ready'; tool: typeof CREDIT_TOOLS.balance } & LedgerBalance)
  | { kind: 'error'; code: string; message: string; tool: typeof CREDIT_TOOLS.balance };

export function ledgerBalanceView(connection: LedgerConnection): LedgerBalanceView {
  switch (connection.status) {
    case 'connected':
      return { kind: 'ready', tool: CREDIT_TOOLS.balance, ...connection.balance };
    case 'loading':
      return { kind: 'loading', tool: CREDIT_TOOLS.balance };
    case 'error':
      return {
        kind: 'error',
        code: connection.code,
        message: connection.message,
        tool: CREDIT_TOOLS.balance,
      };
    case 'not_configured':
      return { kind: 'not_configured', code: 'CREDITS_NOT_CONFIGURED', tool: CREDIT_TOOLS.balance };
  }
}

// ---------------------------------------------------------------------------
// Credits — mapping the tool invoke envelopes onto the views above.
// The page hands the raw ApiResponse of invokeTool(get_credit_balance /
// list_credit_history) to these pure functions; they are the ONLY way a
// response becomes a connection or a history row, so the refusal →
// not-configured and success → numbers rules live in exactly one place.
// ---------------------------------------------------------------------------

/** The structural minimum of the client's ApiResponse the mappers read. */
export interface ToolInvokeOutcome {
  success: boolean;
  data?: Record<string, unknown> | null;
  error?: { code: string; message: string } | null;
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function connectionFromBalanceInvoke(response: ToolInvokeOutcome): LedgerConnection {
  if (response.success) {
    const data = response.data ?? {};
    const { daily, monthly, purchased, total, held } = data;
    if (
      isWholeNumber(daily) &&
      isWholeNumber(monthly) &&
      isWholeNumber(purchased) &&
      isWholeNumber(total) &&
      isWholeNumber(held)
    ) {
      return { status: 'connected', balance: { daily, monthly, purchased, total, held } };
    }
    // A success envelope without the ledger's numbers is not a balance.
    return {
      status: 'error',
      code: 'INVALID_RESPONSE',
      message: 'The balance response did not carry the ledger’s numbers.',
    };
  }
  if (response.error?.code === 'CREDITS_NOT_CONFIGURED') {
    return LEDGER_CONNECTION;
  }
  return {
    status: 'error',
    code: response.error?.code ?? 'UNKNOWN',
    message: response.error?.message ?? 'The balance read failed.',
  };
}

/** One ledger entry as the Usage panel renders it (tool 33's row shape). */
export interface LedgerEntryView {
  id: string;
  entryType: string;
  bucket: string;
  /** Signed whole credits: positive = granted/credited, negative = spent. */
  amount: number;
  reason: string | null;
  sourceRef: string | null;
  createdAt: string;
}

export type LedgerHistoryResult =
  | { state: 'not_configured' }
  | { state: 'error'; message: string }
  | { state: 'ready'; entries: LedgerEntryView[]; total: number };

function ledgerEntryView(raw: Record<string, unknown>): LedgerEntryView {
  const created = raw['createdAt'];
  return {
    id: typeof raw['id'] === 'string' ? raw['id'] : '',
    entryType: typeof raw['entryType'] === 'string' ? raw['entryType'] : 'unknown',
    bucket: typeof raw['bucket'] === 'string' ? raw['bucket'] : '',
    amount: isWholeNumber(raw['amount']) ? raw['amount'] : 0,
    reason: typeof raw['reason'] === 'string' ? raw['reason'] : null,
    sourceRef: typeof raw['sourceRef'] === 'string' ? raw['sourceRef'] : null,
    createdAt:
      created instanceof Date
        ? created.toISOString()
        : typeof created === 'string'
          ? created
          : '',
  };
}

export function historyFromHistoryInvoke(response: ToolInvokeOutcome): LedgerHistoryResult {
  if (response.success) {
    const data = response.data ?? {};
    const rawEntries = Array.isArray(data['entries']) ? data['entries'] : [];
    const entries = rawEntries
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map(ledgerEntryView);
    return {
      state: 'ready',
      entries,
      total: isWholeNumber(data['total']) ? data['total'] : entries.length,
    };
  }
  if (response.error?.code === 'CREDITS_NOT_CONFIGURED') {
    return { state: 'not_configured' };
  }
  return { state: 'error', message: response.error?.message ?? 'The ledger history read failed.' };
}

// ---------------------------------------------------------------------------
// Usage — real job activity (NOT the credit ledger; the panel labels it so)
// ---------------------------------------------------------------------------

export type ActivityKind = 'export' | 'craft_render';
export type ActivityStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * How a row's credits are displayed — always the recorded truth:
 *  - 'not_charged': the backend records no charge for this job kind
 *    (exports are not credit-charged today; jobs.ts pins credit_cost null).
 *  - 'recorded': the exact whole-credit figure the backend recorded,
 *    carried with the metering note the response itself states.
 */
export type ActivityCharge =
  | { kind: 'not_charged'; credits: null; label: 'Not charged' }
  | { kind: 'recorded'; credits: number; label: string; note: string };

export interface ActivityRow {
  id: string;
  kind: ActivityKind;
  /** Human action label, e.g. "Export · mp4 1080p" (the jobs.ts label). */
  action: string;
  projectId: string;
  status: ActivityStatus;
  createdAt: string;
  completedAt: string | null;
  charge: ActivityCharge;
  /** Fresh signed result URL when the backend minted one; else null. */
  outputUrl: string | null;
  /** The produced asset's id (craft renders), for the Assets library. */
  outputAssetId: string | null;
  /** Real failure reason on FAILED rows; null otherwise. */
  error: string | null;
}

const NOT_CHARGED: ActivityCharge = { kind: 'not_charged', credits: null, label: 'Not charged' };

export function activityFromExportJob(job: ServerExportJob): ActivityRow {
  return {
    id: job.id,
    kind: 'export',
    action: `Export · ${job.format} ${job.resolution}`,
    projectId: job.projectId,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    // Exports record no credit charge (CP-1 §3.6 tool 28: exports are
    // FREE). A failed export therefore shows "Not charged", never a
    // refund that did not happen.
    charge: NOT_CHARGED,
    outputUrl: job.status === 'COMPLETED' ? job.outputUrl : null,
    outputAssetId: null,
    error: job.error,
  };
}

export function activityFromCraftRender(job: ServerCraftRenderJob): ActivityRow {
  const comp = job.comp ? ` · ${job.comp}` : '';
  return {
    id: job.id,
    kind: 'craft_render',
    action: `Effect render${comp} · ${job.format}`,
    projectId: job.projectId,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    // The recorded figure, verbatim — including the metering state the
    // response itself declares. creditCost is 0 today because metering
    // is not wired (C-2); if CP-2 ever records a real figure, this row
    // shows that figure, because it shows the record, not a guess.
    charge: {
      kind: 'recorded',
      credits: job.creditCost,
      label: `${job.creditCost} credits recorded`,
      note:
        job.metering === 'not_wired'
          ? 'Metering is not wired yet (CP-2) — this is the recorded cost, and no charge was made.'
          : 'Settled from the credit ledger.',
    },
    outputUrl: job.status === 'COMPLETED' ? job.outputUrl : null,
    outputAssetId: job.status === 'COMPLETED' ? job.outputAssetId : null,
    error: job.error,
  };
}

/** Newest first, merged across sources — the Usage table's row order. */
export function mergeActivity(exports_: ServerExportJob[], crafts: ServerCraftRenderJob[]): ActivityRow[] {
  const rows = [...exports_.map(activityFromExportJob), ...crafts.map(activityFromCraftRender)];
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export interface ActivitySummary {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
}

/** Counts derived from the real rows — the only numbers this unit shows. */
export function activitySummary(rows: ActivityRow[]): ActivitySummary {
  return {
    total: rows.length,
    completed: rows.filter((r) => r.status === 'COMPLETED').length,
    failed: rows.filter((r) => r.status === 'FAILED').length,
    inProgress: rows.filter((r) => r.status === 'QUEUED' || r.status === 'PROCESSING').length,
  };
}

// ---------------------------------------------------------------------------
// Identity — what the client can actually read about the caller today
// ---------------------------------------------------------------------------

export interface IdentityView {
  kind: 'unavailable';
  reason: string;
}

/**
 * useAuth() proves a session exists and nothing more: no name, email,
 * avatar or account id is readable inside QuantCooks today. The follow-up
 * is an identity read on the SSO session (the ecosystem identity service
 * owns the profile; CP-3's agent-identity work is the neighbouring seam).
 */
export const IDENTITY_VIEW: IdentityView = {
  kind: 'unavailable',
  reason:
    'QuantCooks can tell that you are signed in, but your Quant Account profile — name, email, avatar — has no read inside this app yet, so this panel shows no invented identity. The profile fields arrive with the identity read on the SSO session.',
};

// ---------------------------------------------------------------------------
// Public profile (row #68) — real project grid, honest social layer
// ---------------------------------------------------------------------------

export const PUBLISH_UNAVAILABLE_REASON =
  'Publishing needs a publish flag on the project record — update_project accepts only name and type today, so there is nothing honest for this button to call yet (G-17).';

export interface ProfileProjectCard {
  id: string;
  name: string;
  type: ServerProject['type'];
  updatedAt: string;
  /** The real editor route (P0-5 entry) for this project. */
  editorHref: string;
  publish: { available: false; reason: string };
}

export function profileProjectCards(projects: ServerProject[]): ProfileProjectCard[] {
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    updatedAt: p.updatedAt,
    editorHref: `/editor?projectId=${p.id}`,
    publish: { available: false, reason: PUBLISH_UNAVAILABLE_REASON },
  }));
}
