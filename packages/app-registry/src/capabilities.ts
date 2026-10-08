/**
 * EC-01 — Canonical product capability catalog (doc 21 §4 + §5).
 *
 * Every descriptor is validated by CapabilityRegistry.register():
 * commands declare scopes, side effects declare verification events,
 * Tier 3/4 declare approval, every capability declares degraded behavior.
 *
 * Honesty rule: status 'active' requires a verified routeRef pointing at a
 * real route in this repo (verified via the backing route modules).
 * Capabilities declared by the architecture but not yet runtime-wired are
 * registered as 'preview' — never invented as available.
 */
import type {
  Capability,
  CapabilityKind,
  CapabilityStatus,
  QuantAppId,
  RiskTier,
  RouteRef,
} from './capability-types';
import { CapabilityRegistry } from './capability-registry';

type Owner = QuantAppId | 'platform';

interface CapInput {
  id: string;
  owner: Owner;
  /** Product namespace the capability belongs to (for routeRef appId). */
  app: QuantAppId;
  domain: string;
  kind: CapabilityKind;
  sourceOfTruth: string;
  resources: string[];
  scopes: string[];
  risk: RiskTier;
  /** Approval reason → approval.required = true. */
  approval?: string;
  idempotent?: boolean;
  keyStrategy?: string;
  /** Success/verification events. Commands verify these by default. */
  events: string[];
  verifyRequired?: boolean;
  emits?: string[];
  consumes?: string[];
  links?: string[];
  degraded: [Capability['degradedMode']['mode'], string];
  cost?: { meter: string; quote: boolean };
  status: CapabilityStatus;
  route?: RouteRef;
  note?: string;
  version?: number;
}

function cap(input: CapInput): Capability {
  const isCommand = input.kind === 'command';
  const verifyRequired = input.verifyRequired ?? isCommand;
  return {
    capabilityId: input.id,
    version: input.version ?? 1,
    appId: input.app,
    domain: input.domain,
    kind: input.kind,
    owner: { appId: input.owner, sourceOfTruth: input.sourceOfTruth },
    resourceTypes: input.resources,
    inputSchema: `${input.id}/v${input.version ?? 1}/input`,
    outputSchema: `${input.id}/v${input.version ?? 1}/output`,
    requiredScopes: input.scopes,
    riskTier: input.risk,
    idempotency: {
      required: input.idempotent ?? isCommand,
      keyStrategy: input.keyStrategy ?? (input.idempotent ?? isCommand ? 'client-supplied' : undefined),
    },
    approval: { required: input.approval !== undefined, reason: input.approval },
    verification: {
      required: verifyRequired,
      successEvents: verifyRequired ? input.events : [],
      timeoutState: 'unknown',
    },
    cost: input.cost ? { meter: input.cost.meter, quoteRequired: input.cost.quote } : undefined,
    emits: input.emits ?? (isCommand ? input.events : []),
    consumes: input.consumes,
    deepLinks: input.links,
    degradedMode: { mode: input.degraded[0], userState: input.degraded[1] },
    status: input.status,
    routeRef: input.route,
    note: input.note,
  };
}

const R = (
  appId: QuantAppId,
  routeFile: string,
  method: RouteRef['method'],
  path: string,
): RouteRef => ({ appId, routeFile, method, path });

// ---------------------------------------------------------------------------
// QuantMail — source of truth: mailbox/thread/message domain.
// Route evidence: apps/quantmail/backend/routes/{emails,threads,attachments}.ts
// ---------------------------------------------------------------------------

const QUANTMAIL: Capability[] = [
  cap({
    id: 'mail.thread.get', owner: 'quantmail', app: 'quantmail', domain: 'mailbox',
    kind: 'query', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.thread'], scopes: ['mail:read'], risk: 0,
    events: [], verifyRequired: false,
    degraded: ['fail_closed', 'Mail unavailable — threads cannot be shown right now.'],
    links: ['quantmail:///thread/{threadId}'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/threads.ts', 'GET', 'GET /threads/:id'),
  }),
  cap({
    id: 'mail.thread.search', owner: 'quantmail', app: 'quantmail', domain: 'mailbox',
    kind: 'query', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.thread'], scopes: ['mail:read'], risk: 0,
    events: [], verifyRequired: false,
    degraded: ['partial', 'Search index unavailable — showing recent threads only.'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/emails.ts', 'GET', 'GET /emails/search'),
  }),
  cap({
    id: 'mail.draft.create', owner: 'quantmail', app: 'quantmail', domain: 'compose',
    kind: 'command', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.draft'], scopes: ['mail:compose'], risk: 1,
    events: ['mail.draft.created.v1'],
    degraded: ['fail_closed', 'Drafts unavailable — your text is kept locally.'],
    links: ['quantmail:///compose'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/emails.ts', 'POST', 'POST /emails/ (compose)'),
  }),
  cap({
    id: 'mail.draft.update', owner: 'quantmail', app: 'quantmail', domain: 'compose',
    kind: 'command', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.draft'], scopes: ['mail:compose'], risk: 1,
    events: ['mail.draft.updated.v1'],
    degraded: ['fail_closed', 'Drafts unavailable — your text is kept locally.'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/emails.ts', 'PUT', 'PUT /emails/:id'),
  }),
  cap({
    id: 'mail.draft.prepare', owner: 'quantmail', app: 'quantmail', domain: 'compose',
    kind: 'command', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.draft'], scopes: ['mail:compose'], risk: 1,
    events: ['mail.draft.prepared.v1'],
    degraded: ['fail_closed', 'Draft preparation unavailable right now.'],
    status: 'preview',
    note: 'Declared in architecture; no distinct prepare endpoint exists yet — compose flow covers creation.',
  }),
  cap({
    id: 'mail.send.prepare', owner: 'quantmail', app: 'quantmail', domain: 'delivery',
    kind: 'command', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.message'], scopes: ['mail:send'], risk: 1,
    events: ['mail.send.prepared.v1'],
    degraded: ['fail_closed', 'Send preparation unavailable right now.'],
    status: 'preview',
    note: 'Declared in architecture; queueing happens inline in the send path today.',
  }),
  cap({
    id: 'mail.send.execute', owner: 'quantmail', app: 'quantmail', domain: 'delivery',
    kind: 'command', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.message'], scopes: ['mail:send'], risk: 3,
    approval: 'Sending mail is an external side effect.',
    events: ['mail.message.sent.v1'], emits: ['mail.message.sent.v1'],
    cost: { meter: 'mail.delivery', quote: false },
    degraded: ['queue', 'Mail service unreachable — your message is queued and will send when it recovers.'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/emails.ts', 'POST', 'POST /emails/:id/send'),
  }),
  cap({
    id: 'mail.thread.archive', owner: 'quantmail', app: 'quantmail', domain: 'mailbox',
    kind: 'command', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.thread'], scopes: ['mail:write'], risk: 2,
    events: ['mail.thread.archived.v1'], emits: ['mail.thread.archived.v1'],
    degraded: ['fail_closed', 'Mail unavailable — archive not applied.'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/emails.ts', 'POST', 'POST /emails/:id/archive'),
  }),
  cap({
    id: 'mail.thread.restore', owner: 'quantmail', app: 'quantmail', domain: 'mailbox',
    kind: 'command', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.thread'], scopes: ['mail:write'], risk: 2,
    events: ['mail.thread.restored.v1'], emits: ['mail.thread.restored.v1'],
    degraded: ['fail_closed', 'Mail unavailable — restore not applied.'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/emails.ts', 'POST', 'POST /emails/:id/restore'),
  }),
  cap({
    id: 'mail.attachment.reference', owner: 'quantmail', app: 'quantmail', domain: 'attachments',
    kind: 'query', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.attachment'], scopes: ['mail:read'], risk: 0,
    events: [], verifyRequired: false,
    degraded: ['fail_closed', 'Attachments unavailable right now.'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/attachments.ts', 'GET', 'GET /attachments/:id'),
  }),
  cap({
    id: 'mail.security.report', owner: 'quantmail', app: 'quantmail', domain: 'trust-safety',
    kind: 'command', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.message'], scopes: ['mail:write'], risk: 2,
    events: ['mail.message.reported.v1'], emits: ['mail.message.reported.v1'],
    degraded: ['fail_closed', 'Reporting unavailable right now.'],
    status: 'preview',
    note: 'Declared in architecture; no dedicated report endpoint verified yet.',
  }),
];

// ---------------------------------------------------------------------------
// QuantMail AI surfaces — source of truth: mailbox/thread/message domain.
// Route evidence: apps/quantmail/backend/routes/ai.ts, ai-compose.ts.
// QM-QUANTY-002: every Quanty output in mail carries evidence, provenance
// and cost; mutations go through preview. Risk tiers follow EC-01 §3:
// model invocations are tier 1 (metered preparation), the summarize cache
// write is tier 1 (reversible by recompute), send stays tier 3.
// ---------------------------------------------------------------------------

const QUANTMAIL_AI: Capability[] = [
  cap({
    id: 'mail.ai.reply.suggest', owner: 'quantmail', app: 'quantmail', domain: 'ai-assist',
    kind: 'query', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.message'], scopes: ['mail:read'], risk: 1,
    events: [], verifyRequired: false,
    cost: { meter: 'ai.tokens', quote: false },
    degraded: ['fail_closed', 'Reply suggestions unavailable — write your reply manually.'],
    links: ['quantmail:///thread/{threadId}'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/ai.ts', 'GET', 'GET /emails/:id/reply-suggestions'),
  }),
  cap({
    id: 'mail.ai.summarize', owner: 'quantmail', app: 'quantmail', domain: 'ai-assist',
    kind: 'command', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.message'], scopes: ['mail:read'], risk: 1,
    events: ['mail.ai.summarized.v1'],
    cost: { meter: 'ai.tokens', quote: false },
    degraded: ['fail_closed', 'Summary unavailable — read the thread directly.'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/ai.ts', 'POST', 'POST /emails/:id/summarize'),
    note: 'Writes a cached aiSummary on the email; reversible by recompute or clear.',
  }),
  cap({
    id: 'mail.ai.compose.assist', owner: 'quantmail', app: 'quantmail', domain: 'ai-assist',
    kind: 'command', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.draft'], scopes: ['mail:compose'], risk: 1,
    events: ['mail.ai.compose.assisted.v1'],
    cost: { meter: 'ai.tokens', quote: false },
    degraded: ['fail_closed', 'Compose assist unavailable — write manually.'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/ai-compose.ts', 'POST', 'POST /ai/compose'),
    note: 'Draft-only: output lands in the composer for user review; nothing sends.',
  }),
  cap({
    id: 'mail.send.preview', owner: 'quantmail', app: 'quantmail', domain: 'delivery',
    kind: 'query', sourceOfTruth: 'mailbox/thread/message domain',
    resources: ['mail.message'], scopes: ['mail:send'], risk: 1,
    events: [], verifyRequired: false,
    degraded: ['fail_closed', 'Send preview unavailable — review the draft directly.'],
    links: ['quantmail:///compose'],
    status: 'active',
    route: R('quantmail', 'apps/quantmail/backend/routes/ai.ts', 'POST', 'POST /emails/:id/send-preview'),
  }),
];

// ---------------------------------------------------------------------------
// QuantChat — source of truth: conversations/messages/calls.
// Route evidence: apps/quantchat/backend/routes/{conversations,messages,calls,notifications}.ts
// ---------------------------------------------------------------------------

const QUANTCHAT: Capability[] = [
  cap({
    id: 'chat.conversation.get', owner: 'quantchat', app: 'quantchat', domain: 'conversations',
    kind: 'query', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.conversation'], scopes: ['chat:read'], risk: 0,
    events: [], verifyRequired: false,
    degraded: ['fail_closed', 'Chat unavailable — conversations cannot be shown.'],
    links: ['quantchat:///conversation/{conversationId}'],
    status: 'active',
    route: R('quantchat', 'apps/quantchat/backend/routes/conversations.ts', 'GET', 'GET /conversations/:id'),
  }),
  cap({
    id: 'chat.conversation.create', owner: 'quantchat', app: 'quantchat', domain: 'conversations',
    kind: 'command', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.conversation'], scopes: ['chat:write'], risk: 3,
    approval: 'Creating a conversation notifies other people.',
    events: ['chat.conversation.created.v1'], emits: ['chat.conversation.created.v1'],
    degraded: ['fail_closed', 'Chat unavailable — conversation not created.'],
    status: 'active',
    route: R('quantchat', 'apps/quantchat/backend/routes/conversations.ts', 'POST', 'POST /conversations/'),
  }),
  cap({
    id: 'chat.message.get', owner: 'quantchat', app: 'quantchat', domain: 'messages',
    kind: 'query', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.message'], scopes: ['chat:read'], risk: 0,
    events: [], verifyRequired: false,
    degraded: ['fail_closed', 'Chat unavailable — messages cannot be shown.'],
    status: 'active',
    route: R('quantchat', 'apps/quantchat/backend/routes/messages.ts', 'GET', 'GET /conversations/:id/messages'),
  }),
  cap({
    id: 'chat.message.prepare', owner: 'quantchat', app: 'quantchat', domain: 'messages',
    kind: 'command', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.message'], scopes: ['chat:write'], risk: 1,
    events: ['chat.message.prepared.v1'],
    degraded: ['fail_closed', 'Message preparation unavailable right now.'],
    status: 'preview',
    note: 'Declared in architecture; no distinct prepare endpoint verified yet.',
  }),
  cap({
    id: 'chat.message.send', owner: 'quantchat', app: 'quantchat', domain: 'messages',
    kind: 'command', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.message'], scopes: ['chat:send'], risk: 3,
    approval: 'Sending a message is an external side effect.',
    events: ['chat.message.sent.v1'], emits: ['chat.message.sent.v1'],
    degraded: ['queue', 'Chat unavailable — your message is queued and will send when it recovers.'],
    status: 'active',
    route: R('quantchat', 'apps/quantchat/backend/routes/messages.ts', 'POST', 'POST /conversations/:id/messages'),
  }),
  cap({
    id: 'chat.message.edit', owner: 'quantchat', app: 'quantchat', domain: 'messages',
    kind: 'command', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.message'], scopes: ['chat:write'], risk: 2,
    events: ['chat.message.edited.v1'], emits: ['chat.message.edited.v1'],
    degraded: ['fail_closed', 'Chat unavailable — edit not applied.'],
    status: 'active',
    route: R('quantchat', 'apps/quantchat/backend/routes/messages.ts', 'PUT', 'PUT /conversations/messages/:id'),
  }),
  cap({
    id: 'chat.message.delete', owner: 'quantchat', app: 'quantchat', domain: 'messages',
    kind: 'command', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.message'], scopes: ['chat:write'], risk: 3,
    approval: 'Deleting a message affects other participants.',
    events: ['chat.message.deleted.v1'], emits: ['chat.message.deleted.v1'],
    degraded: ['fail_closed', 'Chat unavailable — delete not applied.'],
    status: 'active',
    route: R('quantchat', 'apps/quantchat/backend/routes/messages.ts', 'DELETE', 'DELETE /conversations/messages/:id'),
  }),
  cap({
    id: 'chat.call.prepare', owner: 'quantchat', app: 'quantchat', domain: 'calls',
    kind: 'command', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.call'], scopes: ['chat:call'], risk: 1,
    events: ['chat.call.prepared.v1'],
    degraded: ['fail_closed', 'Calling unavailable right now.'],
    status: 'active',
    route: R('quantchat', 'apps/quantchat/backend/routes/calls.ts', 'POST', 'POST /calls/create'),
  }),
  cap({
    id: 'chat.call.start', owner: 'quantchat', app: 'quantchat', domain: 'calls',
    kind: 'command', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.call'], scopes: ['chat:call'], risk: 3,
    approval: 'Starting a call rings other people.',
    events: ['chat.call.started.v1'], emits: ['chat.call.started.v1'],
    degraded: ['fail_closed', 'Calling unavailable right now.'],
    status: 'active',
    route: R('quantchat', 'apps/quantchat/backend/routes/calls.ts', 'POST', 'POST /calls/initiate'),
  }),
  cap({
    id: 'chat.notification.deliver', owner: 'quantchat', app: 'quantchat', domain: 'notifications',
    kind: 'command', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.notification'], scopes: ['chat:notify'], risk: 2,
    events: ['chat.notification.delivered.v1'], emits: ['chat.notification.delivered.v1'],
    degraded: ['queue', 'Push unavailable — notification queued for retry.'],
    status: 'active',
    route: R('quantchat', 'apps/quantchat/backend/routes/notifications.ts', 'POST', 'POST /notifications/send'),
  }),
  cap({
    id: 'chat.report.create', owner: 'quantchat', app: 'quantchat', domain: 'trust-safety',
    kind: 'command', sourceOfTruth: 'conversations/messages/calls',
    resources: ['chat.message'], scopes: ['chat:write'], risk: 1,
    events: ['chat.report.created.v1'], emits: ['chat.report.created.v1'],
    degraded: ['fail_closed', 'Reporting unavailable right now.'],
    status: 'preview',
    note: 'Declared in architecture; no dedicated report endpoint verified yet.',
  }),
];

// ---------------------------------------------------------------------------
// Remaining products — declared per doc 21 §4, registered as preview.
// Quanty and agents must treat preview as unavailable until runtime-wired.
// ---------------------------------------------------------------------------

const pv = (
  id: string, app: QuantAppId, domain: string, kind: Capability['kind'],
  resources: string[], scopes: string[], risk: RiskTier,
  events: string[], degraded: CapInput['degraded'], approval?: string,
): Capability =>
  cap({
    id, owner: app, app, domain, kind,
    sourceOfTruth: `${app} product domain`,
    resources, scopes, risk, events,
    approval,
    degraded,
    status: 'preview',
    note: 'Declared in doc 21 §4; runtime wiring pending — not yet invocable.',
  });

const OTHER_PRODUCTS: Capability[] = [
  // QuantAI — owns orchestration, not the source data manipulated by an agent.
  pv('ai.session.create', 'quantai', 'sessions', 'command', ['ai.session'], ['ai:use'], 1, ['ai.session.created.v1'], ['fail_closed', 'AI unavailable right now.']),
  pv('ai.session.message', 'quantai', 'sessions', 'command', ['ai.session'], ['ai:use'], 2, ['ai.session.message.sent.v1'], ['fail_closed', 'AI unavailable right now.']),
  pv('ai.plan.create', 'quantai', 'planning', 'command', ['ai.plan'], ['ai:use'], 1, ['ai.plan.created.v1'], ['fail_closed', 'AI unavailable right now.']),
  pv('ai.run.prepare', 'quantai', 'runs', 'command', ['ai.run'], ['ai:use'], 1, ['ai.run.prepared.v1'], ['fail_closed', 'AI unavailable right now.']),
  pv('ai.run.execute', 'quantai', 'runs', 'command', ['ai.run'], ['ai:execute'], 3, ['ai.run.executed.v1'], ['fail_closed', 'AI unavailable right now.'], 'Running an agent acts on your data.'),
  pv('ai.run.cancel', 'quantai', 'runs', 'command', ['ai.run'], ['ai:use'], 2, ['ai.run.cancelled.v1'], ['fail_closed', 'AI unavailable right now.']),
  pv('ai.approval.create', 'quantai', 'approvals', 'command', ['ai.approval'], ['ai:use'], 2, ['ai.approval.created.v1'], ['fail_closed', 'AI unavailable right now.']),
  pv('ai.artifact.get', 'quantai', 'artifacts', 'query', ['ai.artifact'], ['ai:read'], 0, [], ['fail_closed', 'AI unavailable right now.']),
  pv('ai.memory.context.request', 'quantai', 'memory', 'query', ['ai.memory'], ['ai:read'], 0, [], ['partial', 'Memory unavailable — continuing without context.']),
  pv('ai.model.route', 'quantai', 'models', 'command', ['ai.model'], ['ai:use'], 1, ['ai.model.routed.v1'], ['fail_closed', 'AI unavailable right now.']),
  // QuantGram
  pv('gram.profile.get', 'quantgram', 'profiles', 'query', ['gram.profile'], ['gram:read'], 0, [], ['fail_closed', 'QuantGram unavailable right now.']),
  pv('gram.post.get', 'quantgram', 'posts', 'query', ['gram.post'], ['gram:read'], 0, [], ['fail_closed', 'QuantGram unavailable right now.']),
  pv('gram.post.create', 'quantgram', 'posts', 'command', ['gram.post'], ['gram:write'], 1, ['gram.post.created.v1'], ['fail_closed', 'QuantGram unavailable right now.']),
  pv('gram.post.prepare', 'quantgram', 'posts', 'command', ['gram.post'], ['gram:write'], 1, ['gram.post.prepared.v1'], ['fail_closed', 'QuantGram unavailable right now.']),
  pv('gram.post.publish', 'quantgram', 'posts', 'command', ['gram.post'], ['gram:publish'], 3, ['gram.post.published.v1'], ['fail_closed', 'QuantGram unavailable right now.'], 'Publishing is visible to others.'),
  pv('gram.post.edit', 'quantgram', 'posts', 'command', ['gram.post'], ['gram:write'], 2, ['gram.post.edited.v1'], ['fail_closed', 'QuantGram unavailable right now.']),
  pv('gram.post.archive', 'quantgram', 'posts', 'command', ['gram.post'], ['gram:write'], 2, ['gram.post.archived.v1'], ['fail_closed', 'QuantGram unavailable right now.']),
  pv('gram.share.prepare', 'quantgram', 'sharing', 'command', ['gram.post'], ['gram:write'], 1, ['gram.share.prepared.v1'], ['fail_closed', 'QuantGram unavailable right now.']),
  pv('gram.feed.get', 'quantgram', 'feed', 'query', ['gram.feed'], ['gram:read'], 0, [], ['fail_closed', 'QuantGram unavailable right now.']),
  pv('gram.feed.explain', 'quantgram', 'feed', 'query', ['gram.feed'], ['gram:read'], 0, [], ['partial', 'Feed explanations unavailable right now.']),
  pv('gram.report.create', 'quantgram', 'trust-safety', 'command', ['gram.post'], ['gram:write'], 1, ['gram.report.created.v1'], ['fail_closed', 'QuantGram unavailable right now.']),
  // QuantWave
  pv('wave.profile.get', 'quantwave', 'profiles', 'query', ['wave.profile'], ['wave:read'], 0, [], ['fail_closed', 'QuantWave unavailable right now.']),
  pv('wave.post.get', 'quantwave', 'posts', 'query', ['wave.post'], ['wave:read'], 0, [], ['fail_closed', 'QuantWave unavailable right now.']),
  pv('wave.post.create', 'quantwave', 'posts', 'command', ['wave.post'], ['wave:write'], 1, ['wave.post.created.v1'], ['fail_closed', 'QuantWave unavailable right now.']),
  pv('wave.post.publish', 'quantwave', 'posts', 'command', ['wave.post'], ['wave:publish'], 3, ['wave.post.published.v1'], ['fail_closed', 'QuantWave unavailable right now.'], 'Publishing is visible to others.'),
  pv('wave.post.edit', 'quantwave', 'posts', 'command', ['wave.post'], ['wave:write'], 2, ['wave.post.edited.v1'], ['fail_closed', 'QuantWave unavailable right now.']),
  pv('wave.post.archive', 'quantwave', 'posts', 'command', ['wave.post'], ['wave:write'], 2, ['wave.post.archived.v1'], ['fail_closed', 'QuantWave unavailable right now.']),
  pv('wave.community.get', 'quantwave', 'communities', 'query', ['wave.community'], ['wave:read'], 0, [], ['fail_closed', 'QuantWave unavailable right now.']),
  pv('wave.share.prepare', 'quantwave', 'sharing', 'command', ['wave.post'], ['wave:write'], 1, ['wave.share.prepared.v1'], ['fail_closed', 'QuantWave unavailable right now.']),
  pv('wave.feed.get', 'quantwave', 'feed', 'query', ['wave.feed'], ['wave:read'], 0, [], ['fail_closed', 'QuantWave unavailable right now.']),
  pv('wave.trend.get', 'quantwave', 'trends', 'query', ['wave.trend'], ['wave:read'], 0, [], ['fail_closed', 'QuantWave unavailable right now.']),
  pv('wave.report.create', 'quantwave', 'trust-safety', 'command', ['wave.post'], ['wave:write'], 1, ['wave.report.created.v1'], ['fail_closed', 'QuantWave unavailable right now.']),
  // QuantMax — matching and safety remain Max-owned decisions.
  pv('max.profile.get', 'quantmax', 'profiles', 'query', ['max.profile'], ['max:read'], 0, [], ['fail_closed', 'QuantMax unavailable right now.']),
  pv('max.discovery.get', 'quantmax', 'discovery', 'query', ['max.profile'], ['max:read'], 0, [], ['fail_closed', 'QuantMax unavailable right now.']),
  pv('max.preference.update', 'quantmax', 'preferences', 'command', ['max.preference'], ['max:write'], 2, ['max.preference.updated.v1'], ['fail_closed', 'QuantMax unavailable right now.']),
  pv('max.match.get', 'quantmax', 'matching', 'query', ['max.match'], ['max:read'], 0, [], ['fail_closed', 'QuantMax unavailable right now.']),
  pv('max.match.create', 'quantmax', 'matching', 'command', ['max.match'], ['max:write'], 3, ['max.match.created.v1'], ['fail_closed', 'QuantMax unavailable right now.'], 'Creating a match notifies another person.'),
  pv('max.match.report', 'quantmax', 'trust-safety', 'command', ['max.match'], ['max:write'], 1, ['max.match.reported.v1'], ['fail_closed', 'QuantMax unavailable right now.']),
  pv('max.safety.report', 'quantmax', 'trust-safety', 'command', ['max.profile'], ['max:write'], 1, ['max.safety.reported.v1'], ['fail_closed', 'QuantMax unavailable right now.']),
  pv('max.call.prepare', 'quantmax', 'calls', 'command', ['max.call'], ['max:call'], 1, ['max.call.prepared.v1'], ['fail_closed', 'QuantMax unavailable right now.']),
  // QuanTube
  pv('tube.video.get', 'quantube', 'videos', 'query', ['tube.video'], ['tube:read'], 0, [], ['fail_closed', 'QuanTube unavailable right now.']),
  pv('tube.video.search', 'quantube', 'videos', 'query', ['tube.video'], ['tube:read'], 0, [], ['partial', 'Search index unavailable — browsing only.']),
  pv('tube.video.watch', 'quantube', 'videos', 'query', ['tube.video'], ['tube:read'], 0, [], ['partial', 'CDN unavailable — playback unavailable, metadata may remain.']),
  pv('tube.playlist.create', 'quantube', 'playlists', 'command', ['tube.playlist'], ['tube:write'], 1, ['tube.playlist.created.v1'], ['fail_closed', 'QuanTube unavailable right now.']),
  pv('tube.playlist.update', 'quantube', 'playlists', 'command', ['tube.playlist'], ['tube:write'], 2, ['tube.playlist.updated.v1'], ['fail_closed', 'QuanTube unavailable right now.']),
  pv('tube.video.upload.prepare', 'quantube', 'upload', 'command', ['tube.video'], ['tube:upload'], 1, ['tube.video.upload.prepared.v1'], ['fail_closed', 'QuanTube unavailable right now.']),
  pv('tube.video.publish', 'quantube', 'videos', 'command', ['tube.video'], ['tube:publish'], 3, ['tube.video.published.v1'], ['fail_closed', 'QuanTube unavailable right now.'], 'Publishing is visible to others.'),
  pv('tube.live.prepare', 'quantube', 'live', 'command', ['tube.live'], ['tube:publish'], 1, ['tube.live.prepared.v1'], ['fail_closed', 'QuanTube unavailable right now.']),
  pv('tube.live.start', 'quantube', 'live', 'command', ['tube.live'], ['tube:publish'], 3, ['tube.live.started.v1'], ['fail_closed', 'QuanTube unavailable right now.'], 'Going live is visible to others.'),
  pv('tube.share.prepare', 'quantube', 'sharing', 'command', ['tube.video'], ['tube:write'], 1, ['tube.share.prepared.v1'], ['fail_closed', 'QuanTube unavailable right now.']),
  pv('tube.report.create', 'quantube', 'trust-safety', 'command', ['tube.video'], ['tube:write'], 1, ['tube.report.created.v1'], ['fail_closed', 'QuanTube unavailable right now.']),
  // QuantCooks
  pv('cooks.project.get', 'quantcooks', 'projects', 'query', ['cooks.project'], ['cooks:read'], 0, [], ['fail_closed', 'QuantCooks unavailable right now.']),
  pv('cooks.project.create', 'quantcooks', 'projects', 'command', ['cooks.project'], ['cooks:write'], 1, ['cooks.project.created.v1'], ['fail_closed', 'QuantCooks unavailable right now.']),
  pv('cooks.asset.import.prepare', 'quantcooks', 'assets', 'command', ['cooks.asset'], ['cooks:write'], 1, ['cooks.asset.import.prepared.v1'], ['fail_closed', 'QuantCooks unavailable right now.']),
  pv('cooks.timeline.update', 'quantcooks', 'timeline', 'command', ['cooks.project'], ['cooks:write'], 2, ['cooks.timeline.updated.v1'], ['fail_closed', 'QuantCooks unavailable right now.']),
  pv('cooks.edit.prepare', 'quantcooks', 'editing', 'command', ['cooks.project'], ['cooks:write'], 1, ['cooks.edit.prepared.v1'], ['fail_closed', 'QuantCooks unavailable right now.']),
  pv('cooks.render.prepare', 'quantcooks', 'render', 'command', ['cooks.render'], ['cooks:write'], 1, ['cooks.render.prepared.v1'], ['fail_closed', 'QuantCooks unavailable right now.']),
  pv('cooks.render.start', 'quantcooks', 'render', 'command', ['cooks.render'], ['cooks:render'], 2, ['cooks.render.started.v1'], ['queue', 'Render workers unavailable — your render is queued.']),
  pv('cooks.render.cancel', 'quantcooks', 'render', 'command', ['cooks.render'], ['cooks:write'], 2, ['cooks.render.cancelled.v1'], ['fail_closed', 'QuantCooks unavailable right now.']),
  pv('cooks.publish.prepare', 'quantcooks', 'publish', 'command', ['cooks.project'], ['cooks:write'], 1, ['cooks.publish.prepared.v1'], ['fail_closed', 'QuantCooks unavailable right now.']),
  pv('cooks.publish.execute', 'quantcooks', 'publish', 'command', ['cooks.project'], ['cooks:publish'], 3, ['cooks.published.v1'], ['fail_closed', 'QuantCooks unavailable right now.'], 'Publishing is visible to others.'),
  // QuantAds — financial execution always linked to the authoritative economy contract.
  pv('ads.campaign.get', 'quantads', 'campaigns', 'query', ['ads.campaign'], ['ads:read'], 0, [], ['fail_closed', 'QuantAds unavailable right now.']),
  pv('ads.campaign.create', 'quantads', 'campaigns', 'command', ['ads.campaign'], ['ads:write'], 1, ['ads.campaign.created.v1'], ['fail_closed', 'QuantAds unavailable right now.']),
  pv('ads.campaign.draft', 'quantads', 'campaigns', 'command', ['ads.campaign'], ['ads:write'], 1, ['ads.campaign.drafted.v1'], ['fail_closed', 'QuantAds unavailable right now.']),
  pv('ads.campaign.update', 'quantads', 'campaigns', 'command', ['ads.campaign'], ['ads:write'], 2, ['ads.campaign.updated.v1'], ['fail_closed', 'QuantAds unavailable right now.']),
  pv('ads.audience.estimate', 'quantads', 'audiences', 'query', ['ads.audience'], ['ads:read'], 0, [], ['partial', 'Estimates unavailable right now.']),
  pv('ads.creative.prepare', 'quantads', 'creatives', 'command', ['ads.creative'], ['ads:write'], 1, ['ads.creative.prepared.v1'], ['fail_closed', 'QuantAds unavailable right now.']),
  pv('ads.auction.preview', 'quantads', 'auction', 'query', ['ads.auction'], ['ads:read'], 0, [], ['partial', 'Auction preview unavailable right now.']),
  pv('ads.boost.quote', 'quantads', 'boost', 'query', ['ads.boost'], ['ads:read'], 0, [], ['fail_closed', 'Economy unavailable — quotes cannot be produced.']),
  pv('ads.boost.reserve', 'quantads', 'boost', 'command', ['ads.boost'], ['ads:spend'], 3, ['ads.boost.reserved.v1'], ['fail_closed', 'Economy unavailable — UNKNOWN, never charge twice.'], 'Reserving credits holds real money.'),
  pv('ads.boost.commit', 'quantads', 'boost', 'command', ['ads.boost'], ['ads:spend'], 4, ['ads.boost.committed.v1'], ['fail_closed', 'Economy unavailable — UNKNOWN, never charge twice.'], 'Committing spend moves real credits.'),
  pv('ads.payout.get', 'quantads', 'payouts', 'query', ['ads.payout'], ['ads:read'], 0, [], ['fail_closed', 'Economy unavailable right now.']),
  pv('ads.report.get', 'quantads', 'reports', 'query', ['ads.report'], ['ads:read'], 0, [], ['fail_closed', 'QuantAds unavailable right now.']),
];

// ---------------------------------------------------------------------------
// Shared platform capabilities (§5). Owned by the platform, never by products.
// Shared primitives must never quietly absorb product business rules.
// ---------------------------------------------------------------------------

const SHARED_PLATFORM: Capability[] = [
  pv('identity.session.get', 'quantmail', 'identity', 'query', ['identity.session'], ['identity:read'], 0, [], ['fail_closed', 'Identity unavailable right now.']),
  pv('identity.session.revoke', 'quantmail', 'identity', 'command', ['identity.session'], ['identity:write'], 4, ['identity.session.revoked.v1'], ['fail_closed', 'Identity unavailable right now.'], 'Revoking sessions signs the user out everywhere.'),
  pv('identity.consent.get', 'quantmail', 'identity', 'query', ['identity.consent'], ['identity:read'], 0, [], ['fail_closed', 'Identity unavailable right now.']),
  pv('identity.consent.update', 'quantmail', 'identity', 'command', ['identity.consent'], ['identity:write'], 2, ['identity.consent.updated.v1'], ['fail_closed', 'Identity unavailable right now.']),
  pv('resource.resolve', 'quantmail', 'resources', 'query', ['resource.ref'], ['resource:read'], 0, [], ['fail_closed', 'Resource resolution unavailable.']),
  pv('resource.deep_link.resolve', 'quantmail', 'resources', 'query', ['resource.ref'], ['resource:read'], 0, [], ['fail_closed', 'Deep links unavailable right now.']),
  pv('search.universal.query', 'quantmail', 'search', 'query', ['search.result'], ['search:read'], 0, [], ['partial', 'Universal index unavailable — trying each app separately.']),
  pv('notification.create', 'quantmail', 'notifications', 'command', ['notification'], ['notify:send'], 2, ['notification.created.v1'], ['queue', 'Notification service unavailable — queued for retry.']),
  pv('notification.dismiss', 'quantmail', 'notifications', 'command', ['notification'], ['notify:write'], 1, ['notification.dismissed.v1'], ['fail_closed', 'Notification service unavailable.']),
  pv('notification.preference.update', 'quantmail', 'notifications', 'command', ['notification.preference'], ['notify:write'], 2, ['notification.preference.updated.v1'], ['fail_closed', 'Notification service unavailable.']),
  pv('memory.context.request', 'quantmail', 'memory', 'query', ['memory.context'], ['memory:read'], 0, [], ['partial', 'Memory unavailable — continuing without context.']),
  pv('memory.feedback', 'quantmail', 'memory', 'command', ['memory.entry'], ['memory:write'], 1, ['memory.feedback.recorded.v1'], ['fail_closed', 'Memory unavailable right now.']),
  pv('memory.correct.prepare', 'quantmail', 'memory', 'command', ['memory.entry'], ['memory:write'], 1, ['memory.correct.prepared.v1'], ['fail_closed', 'Memory unavailable right now.']),
  pv('memory.forget.prepare', 'quantmail', 'memory', 'command', ['memory.entry'], ['memory:write'], 2, ['memory.forget.prepared.v1'], ['fail_closed', 'Memory unavailable right now.']),
  pv('economy.quote', 'quantmail', 'economy', 'query', ['economy.quote'], ['economy:read'], 0, [], ['fail_closed', 'Economy unavailable — quotes cannot be produced.']),
  pv('economy.reserve', 'quantmail', 'economy', 'command', ['economy.reservation'], ['economy:write'], 3, ['economy.reserved.v1'], ['fail_closed', 'Economy unavailable — UNKNOWN, never charge twice.'], 'Reserving credits holds real money.'),
  pv('economy.commit', 'quantmail', 'economy', 'command', ['economy.reservation'], ['economy:write'], 4, ['economy.committed.v1'], ['fail_closed', 'Economy unavailable — UNKNOWN, never charge twice.'], 'Committing moves real credits.'),
  pv('economy.release', 'quantmail', 'economy', 'command', ['economy.reservation'], ['economy:write'], 2, ['economy.released.v1'], ['fail_closed', 'Economy unavailable right now.']),
  pv('audit.record', 'quantmail', 'audit', 'command', ['audit.entry'], ['audit:write'], 1, ['audit.recorded.v1'], ['fail_closed', 'Audit unavailable — operation not recorded.']),
  pv('feature_flag.evaluate', 'quantmail', 'feature-flags', 'query', ['feature.flag'], ['flags:read'], 0, [], ['partial', 'Flag service unavailable — using safe defaults.']),
];

for (const c of SHARED_PLATFORM) {
  // Shared primitives are platform-owned; the pv() helper stamps the
  // registering app as owner, so correct it here explicitly.
  (c as { owner: Capability['owner'] }).owner = {
    appId: 'platform',
    sourceOfTruth: 'quant platform primitives',
  };
}

/** The full canonical catalog: 9 products + shared platform (§4 + §5). */
export const ALL_CAPABILITIES: readonly Capability[] = Object.freeze([
  ...QUANTMAIL,
  ...QUANTMAIL_AI,
  ...QUANTCHAT,
  ...OTHER_PRODUCTS,
  ...SHARED_PLATFORM,
]);

/** Build a registry pre-loaded with the canonical catalog. */
export function buildCapabilityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  for (const capability of ALL_CAPABILITIES) {
    registry.register(capability);
  }
  return registry;
}

/** Capabilities with verified real route wiring (the K16 proof set). */
export function activeCapabilities(): Capability[] {
  return ALL_CAPABILITIES.filter((c) => c.status === 'active');
}
