/**
 * EC-02 — Cross-App Resource Contract & Context Envelope: canonical types.
 *
 * Source: docs/quant-architecture/22-cross-app-resource-and-context-contract.md.
 *
 * Architectural law: pass references, not databases. Pass context, not entire
 * lives. Pass capabilities, not unrestricted power.
 *
 * Design laws (enforced by resource-ref.ts / context-envelope.ts):
 *  1. The owning product remains source of truth.
 *  2. A resource reference never grants authorization.
 *  3. Consumers use opaque resource IDs and typed resource types.
 *  4. Cross-app context is purpose-bound and minimum-useful.
 *  5. Imported/derived objects preserve provenance.
 *  6. Unknown app/resource types fail closed.
 *  7. URLs, visibility, owner IDs and tenant IDs are never authorization.
 *  8. Ambiguous outcomes stay UNKNOWN; every workflow preserves
 *     correlationId, causationId and eventId.
 */
import type { QuantAppId } from './capability-types';

/** Contract version for QuantResourceRef serialization (§2). */
export const RESOURCE_CONTRACT_VERSION = 1 as const;

/** Schema version for QuantContextEnvelope (§4). */
export const ENVELOPE_SCHEMA_VERSION = 1 as const;

/** Visibility of a referenced resource (§2). Never treated as authorization. */
export type ResourceVisibility = 'private' | 'shared' | 'public';

/**
 * Bounded product-owned resource types (§3). The registry rejects any
 * resourceType not listed for its appId — unknown types fail closed.
 */
export const RESOURCE_VOCABULARY: Readonly<Record<QuantAppId, readonly string[]>> = {
  quantmail: ['mail.thread', 'mail.message', 'mail.draft', 'mail.attachment'],
  quantchat: ['chat.conversation', 'chat.message', 'chat.channel', 'chat.call', 'chat.meeting'],
  quantai: ['ai.session', 'ai.plan', 'ai.run', 'ai.artifact', 'ai.approval'],
  quantgram: ['gram.profile', 'gram.post', 'gram.story', 'gram.reel', 'gram.comment'],
  quantwave: ['wave.profile', 'wave.post', 'wave.reply', 'wave.community', 'wave.topic'],
  quantmax: ['max.profile', 'max.discovery', 'max.match', 'max.safety-case'],
  quantube: ['tube.channel', 'tube.video', 'tube.playlist', 'tube.live', 'tube.comment'],
  quantcooks: ['cooks.project', 'cooks.asset', 'cooks.timeline', 'cooks.render', 'cooks.template'],
  quantads: ['ads.campaign', 'ads.adset', 'ads.creative', 'ads.audience', 'ads.boost', 'ads.payout'],
} as const;

/** Resource-type prefix → canonical app id (e.g. 'mail.thread' → 'quantmail'). */
export const TYPE_PREFIX_TO_APP: Readonly<Record<string, QuantAppId>> = {
  mail: 'quantmail',
  chat: 'quantchat',
  ai: 'quantai',
  gram: 'quantgram',
  wave: 'quantwave',
  max: 'quantmax',
  tube: 'quantube',
  cooks: 'quantcooks',
  ads: 'quantads',
} as const;

/** Canonical deep-link route segment per resource type (§7). */
export const DEEP_LINK_ROUTES: Readonly<Record<string, string>> = {
  'mail.thread': 'mail/thread',
  'chat.conversation': 'chat/conversation',
  'ai.run': 'ai/run',
  'gram.post': 'gram/post',
  'wave.post': 'wave/post',
  'max.match': 'max/match',
  'tube.video': 'tube/video',
  'cooks.project': 'cooks/project',
  'ads.campaign': 'ads/campaign',
} as const;

/**
 * Canonical cross-app resource reference (§2). Opaque ID + typed type.
 * Carries NO authorization — resolution must re-authorize at the owner.
 */
export interface QuantResourceRef {
  /** Contract version of this serialized ref. */
  version: typeof RESOURCE_CONTRACT_VERSION;
  /** Owning product. */
  appId: QuantAppId;
  /** Bounded product-owned type, e.g. 'mail.thread'. */
  resourceType: string;
  /** Opaque identifier, owned by the source product. */
  resourceId: string;
  /** Optional optimistic/stale-state version. */
  resourceVersion?: string;
  /** Visibility hint only — never authorization. */
  visibility: ResourceVisibility;
  /** Canonical web URL, when the owner exposes one. */
  canonicalUrl?: string;
  /** Canonical deep link, e.g. 'quant://mail/thread/abc'. */
  deepLink?: string;
  /** Owner hint only — never authorization. */
  ownerUserId?: string;
  /** Tenant hint only — never authorization. */
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Input accepted by createResourceRef — defaults are applied by the constructor. */
export interface CreateResourceRefInput {
  appId: string;
  resourceType: string;
  resourceId: string;
  resourceVersion?: string;
  visibility?: ResourceVisibility;
  canonicalUrl?: string;
  deepLink?: string;
  ownerUserId?: string;
  tenantId?: string;
}

/** Handoff modes (§6). */
export type HandoffMode = 'OPEN' | 'SHARE' | 'ATTACH' | 'IMPORT' | 'COMMAND' | 'NOTIFY';

export const HANDOFF_MODES: readonly HandoffMode[] = [
  'OPEN',
  'SHARE',
  'ATTACH',
  'IMPORT',
  'COMMAND',
  'NOTIFY',
] as const;

/** Provenance retained by imported/derived objects (§8). */
export interface ResourceProvenance {
  source: QuantResourceRef;
  operation: 'shared' | 'attached' | 'imported' | 'derived';
  sourceVersion?: string;
  importedAt: string;
  actor: string;
  correlationId: string;
}

/** Distributed workflow states (§11). UNKNOWN is mandatory for ambiguity. */
export type WorkflowState =
  | 'PLANNED'
  | 'WAITING_APPROVAL'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'UNKNOWN'
  | 'CANCELLED';

/** Terminal states — no further transitions allowed. */
export const TERMINAL_WORKFLOW_STATES: readonly WorkflowState[] = [
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'UNKNOWN',
  'CANCELLED',
] as const;

/** Envelope purposes (§4) — context is purpose-bound. */
export type EnvelopePurpose =
  | 'user_action'
  | 'notification'
  | 'search'
  | 'recommendation'
  | 'agent_execution'
  | 'analytics'
  | 'memory';

export const ENVELOPE_PURPOSES: readonly EnvelopePurpose[] = [
  'user_action',
  'notification',
  'search',
  'recommendation',
  'agent_execution',
  'analytics',
  'memory',
] as const;

/** Actor types (§4). */
export type EnvelopeActorType = 'user' | 'service' | 'agent';

/** Actor identity reference (§4). */
export interface EnvelopeActor {
  type: EnvelopeActorType;
  /** Opaque identity reference (user id, service id, agent run id). */
  id: string;
  /** Display hint only — never authorization. */
  displayName?: string;
}

/**
 * Canonical cross-app context envelope (§4). Carries context, not
 * unrestricted source data. Purpose-bound and minimum-useful (§5).
 */
export interface QuantContextEnvelope<TPayload = Record<string, unknown>> {
  /** Unique event id. */
  eventId: string;
  /** Envelope schema version. */
  schemaVersion: typeof ENVELOPE_SCHEMA_VERSION;
  /** Distributed tracing: preserved across every workflow (§1). */
  correlationId: string;
  /** Optional cause of this event. */
  causationId?: string;
  actor: EnvelopeActor;
  sourceApp: QuantAppId;
  targetApp?: QuantAppId;
  /** Optional typed resource reference — preferred over embedded data (§5). */
  resourceRef?: QuantResourceRef;
  occurredAt: string;
  tenantId?: string;
  purpose: EnvelopePurpose;
  /** Typed, purpose-bound payload — minimum useful, never a full dump (§5). */
  payload: TPayload;
  /** Declared context-budget tier (§5). */
  budget?: ContextBudget;
}

/** Context budget declaration (§5): preferred transfer order. */
export type BudgetTier = 'reference-only' | 'display-metadata' | 'user-selected' | 'extended';

export interface ContextBudget {
  tier: BudgetTier;
  /** Estimated payload bytes, for enforcement. */
  byteEstimate: number;
}

/** Input accepted by createContextEnvelope — defaults are applied. */
export interface CreateEnvelopeInput<TPayload = Record<string, unknown>> {
  eventId?: string;
  schemaVersion?: number;
  correlationId?: string;
  causationId?: string;
  actor: EnvelopeActor;
  sourceApp: string;
  targetApp?: string;
  resourceRef?: QuantResourceRef;
  occurredAt?: string;
  tenantId?: string;
  purpose: EnvelopePurpose;
  payload: TPayload;
  budget?: ContextBudget;
}

/** Economy operation reference carried by cross-app economic ops (§15). */
export interface EconomyOperationRef {
  operationId: string;
  sourceApp: QuantAppId;
  action: string;
  quoteId?: string;
  reservationId?: string;
}
