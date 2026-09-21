import { describe, expect, it } from 'vitest';
import { knownEventTypes, projectEvent, type StreamEvent } from '../src/projection.js';

function event(over: Partial<StreamEvent> = {}): StreamEvent {
  return {
    eventId: 'evt-1',
    eventType: 'Video.liked',
    aggregateId: 'vid-1',
    occurredAt: '2026-01-01T00:00:00.000Z',
    payload: { userId: 'user-1', creatorId: 'creator-9', category: 'music' },
    ...over,
  };
}

describe('projectEvent', () => {
  it('projects a like into a positive signal', () => {
    expect(projectEvent(event())).toEqual({
      userId: 'user-1',
      app: 'quantube',
      eventType: 'Video.liked',
      subjectType: 'Video',
      subjectId: 'vid-1',
      creatorId: 'creator-9',
      category: 'music',
      weight: 1,
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      eventId: 'evt-1',
    });
  });

  it('records an unlike as a negative weight, not a deletion', () => {
    // "liked then unliked" is not the same as "never liked", and Law 2 says
    // history should not disappear. A scorer wanting net affinity sums weights;
    // one wanting "ever engaged" counts rows. Deleting would destroy both.
    const signal = projectEvent(event({ eventType: 'Video.unliked' }));
    expect(signal?.weight).toBe(-1);
    expect(signal?.eventType).toBe('Video.unliked');
  });

  it('carries creatorId and category, which are what make a signal cross-app', () => {
    const signal = projectEvent(event());
    // These two fields mean the same thing whichever app emitted the event, so a
    // signal earned in quantube is legible to another app's feed.
    expect(signal?.creatorId).toBe('creator-9');
    expect(signal?.category).toBe('music');
  });

  it('keeps the action time, not the projection time', () => {
    // The relay adds lag between the two, and a recency scorer must use when the
    // user acted.
    expect(projectEvent(event({ occurredAt: '2025-06-05T10:00:00.000Z' }))?.occurredAt).toEqual(
      new Date('2025-06-05T10:00:00.000Z'),
    );
  });

  describe('skips rather than guesses', () => {
    it('skips an event type it has no rule for', () => {
      // Folding an unknown event with a guessed weight would dilute the signal.
      expect(projectEvent(event({ eventType: 'Video.transcoded' }))).toBeNull();
      expect(projectEvent(event({ eventType: 'Totally.unknown' }))).toBeNull();
    });

    it('skips when there is no actor to attribute interest to', () => {
      expect(projectEvent(event({ payload: { creatorId: 'c' } }))).toBeNull();
      expect(projectEvent(event({ payload: { userId: '' } }))).toBeNull();
      expect(projectEvent(event({ payload: { userId: 42 } }))).toBeNull();
    });

    it('skips an unparseable timestamp', () => {
      expect(projectEvent(event({ occurredAt: 'not-a-date' }))).toBeNull();
    });

    it('skips when the identity of the event or its subject is missing', () => {
      expect(projectEvent(event({ eventId: '' }))).toBeNull();
      expect(projectEvent(event({ aggregateId: '' }))).toBeNull();
    });
  });

  it('tolerates a missing category rather than inventing one', () => {
    const signal = projectEvent(event({ payload: { userId: 'user-1' } }));
    expect(signal?.category).toBeNull();
    expect(signal?.creatorId).toBeNull();
  });
});

describe('knownEventTypes', () => {
  it('reports exactly the rules that exist', () => {
    expect(knownEventTypes().sort()).toEqual(['Video.liked', 'Video.unliked']);
  });
});
