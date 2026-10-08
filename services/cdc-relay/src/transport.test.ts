import { describe, expect, it } from 'vitest';
import { toEnvelope, type OutboxRecord } from './transport.js';

const record: OutboxRecord = {
  eventId: 'evt-1',
  aggregateType: 'mail.thread',
  aggregateId: 'thread-1',
  eventType: 'mail.thread.updated.v1',
  payload: { subject: 'hello' },
  occurredAt: new Date('2026-10-08T10:00:00.000Z'),
};

describe('event transport envelope', () => {
  it('keeps legacy rows explicit during migration', () => {
    const envelope = toEnvelope(record);
    expect(envelope).toEqual({
      eventId: 'evt-1',
      aggregateType: 'mail.thread',
      aggregateId: 'thread-1',
      eventType: 'mail.thread.updated.v1',
      occurredAt: '2026-10-08T10:00:00.000Z',
      payload: { subject: 'hello' },
    });
  });

  it('builds and validates the canonical envelope when context is supplied', () => {
    const envelope = toEnvelope({
      ...record,
      context: {
        schemaVersion: 1,
        correlationId: 'corr-1',
        actor: { type: 'user', userId: 'user-1' },
        sourceApp: 'quantmail',
        targetApp: 'quantchat',
        purpose: 'user_action',
      },
    });

    expect(envelope).toMatchObject({
      eventId: 'evt-1',
      eventType: 'mail.thread.updated.v1',
      sourceApp: 'quantmail',
      targetApp: 'quantchat',
      correlationId: 'corr-1',
    });
  });
});
