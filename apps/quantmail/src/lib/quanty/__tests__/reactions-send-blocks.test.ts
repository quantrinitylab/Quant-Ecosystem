/**
 * QM-UIUX-025a — the reaction registry must carry DISTINCT events for a
 * missing subject and a missing body. Before this, `QuantyEvent` had only
 * `mail:noRecipients`, so `handleSend` had no honest event to fire for the
 * other two blocks and reused the recipients one for all three.
 *
 * These tests use the REAL registry (no mocks): the events must exist, be
 * registered with a real face, and sit in the same family as
 * `mail:noRecipients` — an unfinished draft is worried, not an error.
 */
import { describe, it, expect } from 'vitest';
import { REACTIONS, type QuantyEvent } from '../reactions';
import { FACE_NAMES } from '../faces';

describe('REACTIONS registry — send-block events (QM-UIUX-025a)', () => {
  it('registers mail:noSubject and mail:noBody as their own events', () => {
    const events: QuantyEvent[] = ['mail:noSubject', 'mail:noBody'];
    for (const event of events) {
      expect(REACTIONS[event]).toBeDefined();
      expect(event).not.toBe('mail:noRecipients');
    }
  });

  it('gives both a real face from the faces table', () => {
    expect(FACE_NAMES).toContain(REACTIONS['mail:noSubject'].face);
    expect(FACE_NAMES).toContain(REACTIONS['mail:noBody'].face);
  });

  it('keeps them in the same family as mail:noRecipients (pulse, outcome priority)', () => {
    const family = REACTIONS['mail:noRecipients'];
    for (const event of ['mail:noSubject', 'mail:noBody'] as const) {
      expect(REACTIONS[event].ms).toBe(family.ms);
      expect(REACTIONS[event].priority).toBe(family.priority);
      // Not an error face: the user has not done anything wrong yet.
      expect(REACTIONS[event].face).not.toBe('error');
    }
  });
});
