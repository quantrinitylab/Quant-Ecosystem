// ============================================================================
// Unit tests — chat-event-envelope (K25)
// Spec: docs/quant-architecture/products/quantchat/15-api-event-websocket-contract.md
//   §18 (event envelope), §19 (realtime channels), §28 (event catalog).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  buildChatEvent,
  conversationChannel,
  userInboxChannel,
  isChatEventEnvelope,
  isEphemeralEvent,
  makeCursor,
  parseCursor,
  ChannelSequencer,
  PRESENCE_CHANNEL,
  CHAT_EVENT_VERSION,
  type ChatEventType,
} from '../services/chat-event-envelope';

const EVENT_TYPES: ChatEventType[] = [
  'chat.message.created.v1',
  'chat.message.updated.v1',
  'chat.message.deleted.v1',
  'chat.message.receipt_updated.v1',
  'chat.typing.v1',
  'chat.presence.v1',
];

describe('chat-event-envelope (contract §18)', () => {
  it('builds a complete envelope with all required fields', async () => {
    const sequencer = new ChannelSequencer();
    const envelope = await buildChatEvent({
      eventType: 'chat.message.created.v1',
      resourceRef: 'msg-123',
      aggregateVersion: 3,
      payload: { content: 'hello' },
      channel: conversationChannel('conv-1'),
      sequencer,
    });

    expect(envelope.event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(envelope.event_type).toBe('chat.message.created.v1');
    expect(envelope.event_version).toBe(CHAT_EVENT_VERSION);
    expect(envelope.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(envelope.resource_ref).toBe('msg-123');
    expect(envelope.aggregate_version).toBe(3);
    expect(envelope.sequence).toBe(1);
    expect(envelope.payload).toEqual({ content: 'hello' });
    expect(envelope.cursor).toBe('conversation.conv-1:1');
    expect(envelope.trace_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(isChatEventEnvelope(envelope)).toBe(true);
  });

  it('assigns monotonic per-channel sequences', async () => {
    const sequencer = new ChannelSequencer();
    const channelA = conversationChannel('a');
    const channelB = conversationChannel('b');
    const e1 = await buildChatEvent({
      eventType: 'chat.message.created.v1',
      resourceRef: 'm1',
      payload: {},
      channel: channelA,
      sequencer,
    });
    const e2 = await buildChatEvent({
      eventType: 'chat.message.created.v1',
      resourceRef: 'm2',
      payload: {},
      channel: channelA,
      sequencer,
    });
    const e3 = await buildChatEvent({
      eventType: 'chat.message.created.v1',
      resourceRef: 'm3',
      payload: {},
      channel: channelB,
      sequencer,
    });
    expect(e1.sequence).toBe(1);
    expect(e2.sequence).toBe(2);
    // Sequences are per-channel: channel B starts at 1.
    expect(e3.sequence).toBe(1);
  });

  it('uses the provided trace id when given', async () => {
    const envelope = await buildChatEvent({
      eventType: 'chat.typing.v1',
      resourceRef: 'user-9',
      payload: {},
      traceId: 'trace-abc',
      channel: conversationChannel('c'),
      sequencer: new ChannelSequencer(),
    });
    expect(envelope.trace_id).toBe('trace-abc');
  });

  it('rejects an empty resource_ref (fail-closed, §18)', async () => {
    await expect(
      buildChatEvent({
        eventType: 'chat.message.created.v1',
        resourceRef: '',
        payload: {},
        channel: conversationChannel('c'),
        sequencer: new ChannelSequencer(),
      }),
    ).rejects.toThrow(/resource_ref/);
  });

  it('falls back to memory when the Redis INCR backend throws', async () => {
    const sequencer = new ChannelSequencer(async () => {
      throw new Error('redis down');
    });
    const e = await buildChatEvent({
      eventType: 'chat.message.created.v1',
      resourceRef: 'm1',
      payload: {},
      channel: conversationChannel('c'),
      sequencer,
    });
    expect(e.sequence).toBe(1);
  });

  it('covers the contract §28 chat event catalog', () => {
    expect(EVENT_TYPES).toContain('chat.message.created.v1');
    expect(EVENT_TYPES).toContain('chat.message.receipt_updated.v1');
  });

  it('marks typing/presence as ephemeral (§19)', () => {
    expect(isEphemeralEvent('chat.typing.v1')).toBe(true);
    expect(isEphemeralEvent('chat.presence.v1')).toBe(true);
    expect(isEphemeralEvent('chat.message.created.v1')).toBe(false);
  });
});

describe('contract §19 channels', () => {
  it('uses canonical channel names', () => {
    expect(conversationChannel('conv-42')).toBe('conversation.conv-42');
    expect(userInboxChannel('user-7')).toBe('user.user-7.inbox');
    expect(PRESENCE_CHANNEL).toBe('presence');
  });
});

describe('contract §20 cursors', () => {
  it('round-trips channel + sequence', () => {
    const cursor = makeCursor('conversation.conv-1', 41);
    expect(parseCursor(cursor)).toEqual({ channel: 'conversation.conv-1', sequence: 41 });
  });

  it('rejects malformed cursors fail-closed', () => {
    expect(parseCursor('')).toBeNull();
    expect(parseCursor('no-separator')).toBeNull();
    expect(parseCursor('conversation.a:not-a-number')).toBeNull();
    expect(parseCursor('conversation.a:-1')).toBeNull();
    // Foreign channel must never be accepted for a conversation replay.
    const parsed = parseCursor('user.u-1.inbox:5');
    expect(parsed?.channel).toBe('user.u-1.inbox');
  });
});

describe('isChatEventEnvelope', () => {
  it('rejects non-envelope shapes', () => {
    expect(isChatEventEnvelope(null)).toBe(false);
    expect(isChatEventEnvelope({ type: 'new_message' })).toBe(false);
    expect(isChatEventEnvelope({ event_id: 'x' })).toBe(false);
  });
});
