/**
 * EC-01 — Ecosystem App Capability Registry: canonical contract types.
 *
 * Source: docs/quant-architecture/21-ecosystem-app-capability-registry.md §2.
 *
 * Design laws (enforced by capability-registry.ts, not just documented):
 *  1. Product ownership is explicit.
 *  2. Capabilities are versioned.
 *  3. Commands are typed.
 *  4. Reads and side effects are separate.
 *  5. Quanty receives capabilities, never database access.
 *  6. Every capability declares required scopes and risk tier.
 *  7. Every capability declares source-of-truth ownership.
 *  8. Every side effect declares its success event and verification rule.
 *  9. Every capability declares degraded behavior.
 * 10. Unknown capability/version fails closed.
 * 11. Registry metadata is not authorization; runtime authorization is mandatory.
 * 12. Removing a capability must not require deleting the owning product.
 */

/** The nine canonical products. Matches apps/<id> and the PRODUCT_APPS catalog. */
export type QuantAppId =
  | 'quantmail'
  | 'quantchat'
  | 'quantai'
  | 'quantgram'
  | 'quantwave'
  | 'quantmax'
  | 'quantube'
  | 'quantcooks'
  | 'quantads';

/** Owner of shared platform primitives (identity, economy, search, …). */
export type PlatformOwnerId = 'platform';

/** Who may own a capability: a product, or the shared platform. */
export type CapabilityOwnerId = QuantAppId | PlatformOwnerId;

export const QUANT_APP_IDS: readonly QuantAppId[] = [
  'quantmail',
  'quantchat',
  'quantai',
  'quantgram',
  'quantwave',
  'quantmax',
  'quantube',
  'quantcooks',
  'quantads',
];

/** Reads and side effects are separate (§2 law 4). */
export type CapabilityKind = 'query' | 'command' | 'event' | 'projection';

/**
 * Risk tier semantics (§3):
 * 0 — read-only.
 * 1 — draft or reversible preparation.
 * 2 — low-risk reversible action.
 * 3 — external side effect; confirmation by default unless a durable user
 *     policy explicitly authorizes it.
 * 4 — destructive, administrative or financial; confirmation plus step-up
 *     authentication where policy requires it.
 */
export type RiskTier = 0 | 1 | 2 | 3 | 4;

/**
 * Lifecycle status. `preview` = declared in architecture, runtime wiring not
 * yet complete — registered honestly so the registry (and Quanty) never
 * invents availability. `active` requires a verified routeRef.
 */
export type CapabilityStatus = 'active' | 'preview' | 'deprecated' | 'disabled';

/** Honest wiring evidence: the real route/handler this capability maps to. */
export interface RouteRef {
  /** Owning product whose backend serves this route. */
  appId: QuantAppId;
  /** Repo-relative path of the route module, e.g. 'apps/quantmail/backend/routes/emails.ts'. */
  routeFile: string;
  /** HTTP method of the backing endpoint. */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Mounted path, e.g. 'POST /emails/:id/send'. */
  path: string;
}

/** The canonical capability descriptor (§2). */
export interface Capability {
  capabilityId: string;
  version: number;
  /** Product namespace this capability belongs to (matches capabilityId prefix family). */
  appId: QuantAppId;
  domain: string;
  kind: CapabilityKind;
  owner: { appId: CapabilityOwnerId; sourceOfTruth: string };
  resourceTypes: string[];
  /** Schema identifier for the input contract (product-owned detail). */
  inputSchema: string;
  /** Schema identifier for the output contract (product-owned detail). */
  outputSchema: string;
  requiredScopes: string[];
  riskTier: RiskTier;
  idempotency: { required: boolean; keyStrategy?: string };
  approval: { required: boolean; reason?: string };
  verification: {
    required: boolean;
    successEvents: string[];
    timeoutState: 'unknown' | 'failed';
  };
  cost?: { meter?: string; quoteRequired: boolean };
  emits: string[];
  consumes?: string[];
  deepLinks?: string[];
  degradedMode: {
    mode: 'fail_closed' | 'read_cache' | 'queue' | 'partial';
    userState: string;
  };
  status: CapabilityStatus;
  /** Required when status === 'active': proof the capability is real. */
  routeRef?: RouteRef;
  /** Human note, e.g. why a capability is preview. */
  note?: string;
}

/** Quanty never sees the raw registry — only this policy-filtered projection (§7). */
export interface QuantyTool {
  toolId: string;
  capabilityId: string;
  version: number;
  description: string;
  inputSchema: string;
  riskTier: RiskTier;
  requiresApproval: boolean;
  estimatedCost?: { credits: number; meter: string };
}

/** Caller context for one invocation (§6). */
export interface InvocationContext {
  callerType: 'user' | 'quanty' | 'service' | 'admin';
  userId?: string;
  tenantId?: string;
  /** Audience the caller claims (must match the capability's owning surface). */
  audience?: string;
  /** Scopes the caller actually holds — runtime authorization input. */
  scopes: string[];
  /** Durable user policy pre-authorizations, e.g. { 'chat.message.send': true }. */
  policyGrants?: Record<string, boolean>;
  /** Whether the user already approved this invocation (Tier 3/4). */
  approvalGranted?: boolean;
  /** Whether step-up authentication completed (Tier 4). */
  stepUpCompleted?: boolean;
  /** Idempotency key for the invocation (required when capability demands it). */
  idempotencyKey?: string;
  /** Opaque input payload — validated by the owning product's handler. */
  input?: unknown;
  /** Correlation id for observability. */
  correlationId?: string;
}

/** Fail-closed decision produced before any side effect runs. */
export type InvocationDecision =
  | { allowed: true; requiresApproval: false }
  | { allowed: true; requiresApproval: true; approvalReason: string }
  | { allowed: false; error: string; detail?: string };

/** Result of a full §6 invocation. */
export interface InvocationResult {
  ok: boolean;
  capabilityId: string;
  version: number;
  /** 'executed' | 'approval_required' | 'step_up_required' | 'replayed' | 'failed' */
  state: 'executed' | 'approval_required' | 'step_up_required' | 'replayed' | 'failed';
  error?: string;
  detail?: string;
  data?: unknown;
  verificationState?: 'verified' | 'unknown' | 'failed';
  latencyMs?: number;
}
