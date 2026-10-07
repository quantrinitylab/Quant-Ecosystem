/**
 * K1 — mail-domain outbox emits.
 *
 * Spec: docs/quant-architecture §05 (data-and-event-architecture) demands that a
 * domain state change and its outbox record are written in ONE transaction, with
 * asynchronous publish afterwards. The `outbox_events` table, the cdc-relay
 * poller and the search-indexer consumer already exist; the mail backend simply
 * never wrote to the table. Every core mail mutation below now wraps its domain
 * write and one `outboxEvent.create` in the same `prisma.$transaction`, so the
 * spine is fed atomically — a failed emit rolls back the mutation, and a
 * committed mutation always has its event.
 *
 * Event names are the EXACT names from
 * docs/quant-architecture/products/quantmail/backend/*-events.md — nothing is
 * invented. The two draft names are the spec's draft operation names from
 * compose-api.md / compose-domain.md; the spec defines no `.v1` versioned draft
 * events (noted as a spec gap in the PR).
 *
 * Payloads carry ids + occurredAt + actor scope only — never message bodies,
 * per the lifecycle contract ("events never contain raw secrets or unnecessary
 * message content"). Consumers (search-indexer, notifications, analytics) are
 * idempotent per the event docs, so at-least-once redelivery is safe.
 */

/**
 * Spec'd mail event names. Comment on each cites the doc that defines it.
 */
export const MailOutboxEvents = {
  /** events.md (M01 inbox events) */
  threadArchived: 'mail.thread.archived.v1',
  /** events.md (M01 inbox events) */
  threadRestored: 'mail.thread.restored.v1',
  /** events.md (M01 inbox events) */
  threadLabelChanged: 'mail.thread.label_changed.v1',
  /** attention-events.md, search-events.md */
  messageReceived: 'mail.message.received.v1',
  /** search-events.md */
  messageDeleted: 'mail.message.deleted.v1',
  /** delivery-events.md (M13) */
  outboundQueued: 'mail.outbound.queued.v1',
  /** delivery-events.md (M13) */
  outboundSubmitted: 'mail.outbound.submitted.v1',
  /** delivery-events.md (M13) */
  outboundDeferred: 'mail.outbound.deferred.v1',
  /** delivery-events.md (M13) */
  outboundCancelled: 'mail.outbound.cancelled.v1',
  /**
   * compose-api.md / compose-domain.md draft operation name.
   * SPEC GAP: no `.v1` versioned draft event is defined in the spec docs.
   */
  draftCreated: 'mail.draft.create',
  /**
   * compose-api.md / compose-domain.md draft operation name.
   * SPEC GAP: no `.v1` versioned draft event is defined in the spec docs.
   */
  draftUpdated: 'mail.draft.update',
} as const;

export type MailOutboxEventName =
  (typeof MailOutboxEvents)[keyof typeof MailOutboxEvents];

export interface OutboxEmit {
  event: MailOutboxEventName;
  /** Matches the cdc-relay stream naming (`outbox.Email`, `outbox.EmailThread`, …). */
  aggregateType: 'Email' | 'EmailThread';
  aggregateId: string;
  /** Ids + actor scope only — never bodies or secrets. */
  payload: Record<string, unknown>;
}

/**
 * Minimal transaction-client surface the emit needs. Test doubles satisfy it
 * structurally; the real Prisma interactive-transaction client carries the
 * `outboxEvent` delegate at runtime.
 */
export interface OutboxTx {
  outboxEvent: {
    create(args: unknown): Promise<unknown>;
  };
}

/**
 * Write one outbox row inside the caller's transaction.
 *
 * Must be called with the SAME `tx` that performed the domain write, inside
 * the same `prisma.$transaction` callback — never with the root client.
 * (The parameter is intentionally `object` with a single contained cast: the
 * backend's project typecheck resolves a stale PrismaClient view without the
 * `outboxEvent` delegate — a pre-existing condition also visible in
 * packages/auth and packages/database — while the runtime client and the
 * generated types both carry it. This keeps the call sites clean and the
 * runtime behaviour exact.)
 */
export async function emitOutbox(tx: object, emit: OutboxEmit): Promise<void> {
  const client = tx as unknown as OutboxTx;
  await client.outboxEvent.create({
    data: {
      aggregateType: emit.aggregateType,
      aggregateId: emit.aggregateId,
      eventType: emit.event,
      payload: {
        occurredAt: new Date().toISOString(),
        ...emit.payload,
      },
    },
  });
}
