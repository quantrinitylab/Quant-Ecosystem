// ============================================================================
// QuantChat — Contract event envelope (K25)
//
// Implements docs/quant-architecture/products/quantchat/15-api-event-websocket-contract.md
//   §18 — WebSocket event envelope
//   §19 — Realtime channels
//   §28 — Event catalog baseline (chat subset)
//
// Every realtime event published by the QuantChat backend carries this
// envelope. Clients dedupe by `event_id` and detect gaps through
// `sequence`/`cursor` (§18). Reconnect resume is cursor-based (§20):
// the client sends `last_event_cursor` on (re)join and the server replays
// buffered events with a greater sequence, or answers `snapshot_required`
// when the gap exceeds the buffer.
// ============================================================================

import { randomUUID } from 'node:crypto';

/**
 * Contract §28 — event catalog (chat subset). Typing and presence are not in
 * the durable catalog: per §19 they use ephemeral TTL semantics and are never
 * treated as durable facts, so they are versioned here as ephemeral events.
 */
export type ChatEventType =
  | 'chat.message.created.v1'
  | 'chat.message.updated.v1'
  | 'chat.message.deleted.v1'
  | 'chat.message.receipt_updated.v1'
  | 'chat.typing.v1'
  | 'chat.presence.v1';

export const CHAT_EVENT_VERSION = 1;

/** Ephemeral event types — excluded from the resume ring buffer (§19). */
const EPHEMERAL_TYPES: ReadonlySet<ChatEventType> = new Set(['chat.typing.v1', 'chat.presence.v1']);

export function isEphemeralEvent(type: ChatEventType): boolean {
  return EPHEMERAL_TYPES.has(type);
}

/**
 * Contract §18 — the event envelope. Every field is required; clients must
 * not infer tenant/resource scope from any client-provided display field.
 */
export interface ChatEventEnvelope {
  /** Unique id — clients dedupe on this (§18). */
  event_id: string;
  event_type: ChatEventType;
  event_version: number;
  /** ISO-8601 timestamp of the server-side transition. */
  occurred_at: string;
  /** Stable resource reference, e.g. the message ref. */
  resource_ref: string;
  /** Aggregate version of the resource at event time. */
  aggregate_version: number;
  /** Per-channel monotonic sequence — gap detection (§18). */
  sequence: number;
  payload: unknown;
  /** Opaque resume cursor: `<channel>:<sequence>` (§20). */
  cursor: string;
  trace_id: string;
}

/** Contract §19 — canonical channel names. */
export function conversationChannel(conversationRef: string): string {
  return `conversation.${conversationRef}`;
}

export function userInboxChannel(userId: string): string {
  return `user.${userId}.inbox`;
}

/** Dedicated channel for user presence transitions (ephemeral, §19). */
export const PRESENCE_CHANNEL = 'presence';

/** Build an opaque resume cursor for a channel+sequence (§20). */
export function makeCursor(channel: string, sequence: number): string {
  return `${channel}:${sequence}`;
}

/** Parse a resume cursor; returns null when malformed (fail-closed). */
export function parseCursor(cursor: string): { channel: string; sequence: number } | null {
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 256) return null;
  const idx = cursor.lastIndexOf(':');
  if (idx <= 0) return null;
  const sequence = Number(cursor.slice(idx + 1));
  if (!Number.isInteger(sequence) || sequence < 0) return null;
  const channel = cursor.slice(0, idx);
  if (channel.length === 0) return null;
  return { channel, sequence };
}

/**
 * Monotonic per-channel sequence allocator. Uses Redis INCR when a backend is
 * supplied (cluster-correct across instances); otherwise an in-memory counter
 * (single-process monotonic). A Redis failure degrades to memory rather than
 * blocking event publication.
 */
export class ChannelSequencer {
  private readonly memory = new Map<string, number>();

  constructor(private readonly incr?: (key: string) => Promise<number>) {}

  async next(channel: string): Promise<number> {
    if (this.incr) {
      try {
        const n = await this.incr(`quantchat:evtseq:${channel}`);
        if (Number.isInteger(n) && n > 0) return n;
      } catch {
        // Degrade to the in-memory counter rather than dropping the event.
      }
    }
    const next = (this.memory.get(channel) ?? 0) + 1;
    this.memory.set(channel, next);
    return next;
  }
}

export interface BuildChatEventInput {
  eventType: ChatEventType;
  /** Stable resource reference — required by §18; never empty. */
  resourceRef: string;
  aggregateVersion?: number;
  payload: unknown;
  traceId?: string;
  channel: string;
  /** Minimal sequence source (ChannelSequencer or any compatible allocator). */
  sequencer: { next(channel: string): Promise<number> };
}

/**
 * Build a §18 envelope. The sender identity is stamped by the caller from the
 * authenticated session — never trusted from client input (fail-closed, per
 * the QuantWave radar P0 lesson).
 */
export async function buildChatEvent(input: BuildChatEventInput): Promise<ChatEventEnvelope> {
  if (!input.resourceRef || typeof input.resourceRef !== 'string') {
    throw new Error('resource_ref is required (§18)');
  }
  if (!input.channel || typeof input.channel !== 'string') {
    throw new Error('channel is required (§19)');
  }
  const sequence = await input.sequencer.next(input.channel);
  return {
    event_id: randomUUID(),
    event_type: input.eventType,
    event_version: CHAT_EVENT_VERSION,
    occurred_at: new Date().toISOString(),
    resource_ref: input.resourceRef,
    aggregate_version: input.aggregateVersion ?? 1,
    sequence,
    payload: input.payload,
    cursor: makeCursor(input.channel, sequence),
    trace_id: input.traceId ?? randomUUID(),
  };
}

/** Type guard for the §18 envelope (shared by backend + frontend normalizer). */
export function isChatEventEnvelope(value: unknown): value is ChatEventEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.event_id === 'string' &&
    typeof v.event_type === 'string' &&
    typeof v.cursor === 'string' &&
    typeof v.occurred_at === 'string' &&
    typeof v.resource_ref === 'string'
  );
}
