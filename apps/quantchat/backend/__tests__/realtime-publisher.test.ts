// ============================================================================
// Unit tests — realtime-publisher (K25)
//
// Verifies the core K25 wiring: a REST mutation publishes a contract §18
// envelope event to the realtime backplane so live sockets receive it.
// Uses the SharedBusBackplane harness (in-memory Redis pub/sub stand-in).
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { publishConversationEvent } from '../services/realtime-publisher';
import { isChatEventEnvelope } from '../services/chat-event-envelope';
import { SharedBusBackplane, InMemoryBus } from './fake-realtime-bus';
import type { RoomEvent } from '../services/realtime-backplane';

function fakeFastify(backplane: unknown) {
  const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  const fastify = { realtimeBackplane: backplane, log } as unknown as import('fastify').FastifyInstance;
  return { fastify, log };
}

describe('publishConversationEvent', () => {
  it('publishes a §18 envelope for a REST-sent message', async () => {
    const bus = new InMemoryBus();
    const backplane = new SharedBusBackplane(bus, 'inst-test-1');
    const received: RoomEvent[] = [];
    backplane.onMessage((_conversationId, event) => {
      received.push(event);
    });
    await backplane.subscribe('conv-1');

    const { fastify, log } = fakeFastify(backplane);
    const envelope = await publishConversationEvent(fastify, 'conv-1', {
      eventType: 'chat.message.created.v1',
      resourceRef: 'msg-1',
      aggregateVersion: 1,
      data: { id: 'msg-1', content: 'hello' },
    });

    expect(envelope).not.toBeNull();
    expect(isChatEventEnvelope(envelope)).toBe(true);
    expect(envelope?.event_type).toBe('chat.message.created.v1');
    expect(envelope?.resource_ref).toBe('msg-1');
    // InMemoryBus delivers synchronously to subscribers, including the origin
    // (mirrors Redis pub/sub); the origin instance filters its own echo.
    expect(received.length).toBe(1);
    expect(received[0]?.envelope?.event_id).toBe(envelope?.event_id);
    expect(received[0]?.originInstanceId).toBe('inst-test-1');
  });

  it('assigns increasing sequences across publishes', async () => {
    const bus = new InMemoryBus();
    const backplane = new SharedBusBackplane(bus, 'inst-test-2');
    const { fastify } = fakeFastify(backplane);

    const e1 = await publishConversationEvent(fastify, 'conv-9', {
      eventType: 'chat.message.created.v1',
      resourceRef: 'm1',
      data: {},
    });
    const e2 = await publishConversationEvent(fastify, 'conv-9', {
      eventType: 'chat.message.created.v1',
      resourceRef: 'm2',
      data: {},
    });
    expect(e1?.sequence).toBe(1);
    expect(e2?.sequence).toBe(2);
    expect(e2?.cursor).toBe('conversation.conv-9:2');
  });

  it('no-ops with a warning when the backplane is not decorated', async () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const fastify = { log } as unknown as import('fastify').FastifyInstance;
    const envelope = await publishConversationEvent(fastify, 'conv-1', {
      eventType: 'chat.message.created.v1',
      resourceRef: 'm1',
      data: {},
    });
    expect(envelope).toBeNull();
    expect(log.warn.mock.calls.length).toBe(1);
  });

  it('never throws when the backplane publish fails', async () => {
    const bus = new InMemoryBus();
    const backplane = new SharedBusBackplane(bus, 'inst-test-3');
    backplane.failPublishWith = new Error('boom');
    const { fastify, log } = fakeFastify(backplane);
    const envelope = await publishConversationEvent(fastify, 'conv-1', {
      eventType: 'chat.message.created.v1',
      resourceRef: 'm1',
      data: {},
    });
    // The REST mutation must not fail because realtime is down.
    expect(envelope).toBeNull();
    expect(log.error.mock.calls.length).toBe(1);
  });
});
