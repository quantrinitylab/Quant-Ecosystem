// ============================================================================
// QuantChat — Realtime publisher for REST routes (K25)
//
// The primary mutation path is REST (POST /conversations/:id/messages, ...).
// Before K25 those mutations never reached live sockets — only frames sent
// over an existing WebSocket were fanned out. This module closes that gap:
// every REST mutation publishes a contract §18 envelope event to the realtime
// backplane so connected sockets receive it live (contract §1: "WebSocket
// accelerates projections").
//
// Realtime failure never fails the REST response — it is logged and the
// durable mutation (already committed) remains the source of truth, recoverable
// through queries/cursors per the contract's architectural invariant.
// ============================================================================

import type { FastifyInstance } from 'fastify';
import {
  buildChatEvent,
  conversationChannel,
  type ChatEventEnvelope,
  type ChatEventType,
} from './chat-event-envelope';
import type { RealtimeBackplane, RoomEvent } from './realtime-backplane';

export interface ConversationEventInput {
  /** Contract §28 event type. */
  eventType: ChatEventType;
  /** Stable resource reference (§18) — e.g. the message id. */
  resourceRef: string;
  aggregateVersion?: number;
  /** Event payload (the projection clients render). */
  data: unknown;
  /** Optional trace correlation (§18). */
  traceId?: string;
}

function getBackplane(fastify: FastifyInstance): RealtimeBackplane | null {
  const backplane = (fastify as unknown as { realtimeBackplane?: RealtimeBackplane })
    .realtimeBackplane;
  return backplane ?? null;
}

/**
 * Publish a contract-envelope event for a conversation to the realtime
 * backplane. Safe to call from any REST route: no-ops (with a warning) when
 * the backplane is not decorated, and never throws.
 */
export async function publishConversationEvent(
  fastify: FastifyInstance,
  conversationId: string,
  input: ConversationEventInput,
): Promise<ChatEventEnvelope | null> {
  const backplane = getBackplane(fastify);
  if (!backplane) {
    fastify.log.warn(
      { conversationId, eventType: input.eventType },
      'realtime backplane not decorated; skipping event publish',
    );
    return null;
  }
  const channel = conversationChannel(conversationId);
  try {
    const envelope = await buildChatEvent({
      eventType: input.eventType,
      resourceRef: input.resourceRef,
      aggregateVersion: input.aggregateVersion,
      payload: input.data,
      traceId: input.traceId,
      channel,
      sequencer: {
        next: (c: string) => backplane.nextSequence(c),
      },
    });
    const event: RoomEvent = {
      // Legacy type retained for in-flight consumers; the envelope is canonical.
      type: 'new_message',
      originInstanceId: backplane.instanceId,
      payload: envelope,
      envelope,
    };
    await backplane.publish(conversationId, event);
    return envelope;
  } catch (err) {
    // Realtime is an acceleration path — never fail the REST mutation.
    fastify.log.error(
      { err, conversationId, eventType: input.eventType },
      'realtime event publish failed',
    );
    return null;
  }
}
