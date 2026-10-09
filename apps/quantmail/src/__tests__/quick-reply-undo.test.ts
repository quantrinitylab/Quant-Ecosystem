import { describe, expect, it } from 'vitest';
import {
  removeMessageById,
  reseatExpandedAfterRemoval,
} from '../components/ConversationalThreadView';
import type { Email } from '../types';

let seq = 0;
const msg = (over: Partial<Email> = {}): Email =>
  ({
    id: `msg-${++seq}`,
    messageKind: 'chat',
    bodyText: 'hello',
    ...over,
  }) as Email;

/**
 * QM-UIUX-087: undoing a quick-reply send must drop exactly the reply bubble
 * from the timeline and re-seat the expanded indices against the shorter
 * array — no shifted or stale expansions left behind.
 */
describe('quick-reply undo state helpers', () => {
  describe('removeMessageById', () => {
    it('drops only the undone reply, keeping the rest in order', () => {
      const msgs = [msg({ id: 'm-1' }), msg({ id: 'm-2' }), msg({ id: 'm-3' })];
      const next = removeMessageById(msgs, 'm-2');
      expect(next.map((m) => m.id)).toEqual(['m-1', 'm-3']);
    });

    it('is a no-op when the id is not present (undo racing realtime)', () => {
      const msgs = [msg({ id: 'm-1' }), msg({ id: 'm-2' })];
      expect(removeMessageById(msgs, 'missing')).toBe(msgs);
    });

    it('drops the last (optimistic) bubble — the common undo case', () => {
      const msgs = [msg({ id: 'm-1' }), msg({ id: 'reply-1' })];
      const next = removeMessageById(msgs, 'reply-1');
      expect(next.map((m) => m.id)).toEqual(['m-1']);
    });
  });

  describe('reseatExpandedAfterRemoval', () => {
    it('drops the removed index and shifts higher indices down one', () => {
      expect(reseatExpandedAfterRemoval(new Set([0, 2, 3]), 1)).toEqual(new Set([0, 1, 2]));
    });

    it('leaves indices below the removed row untouched', () => {
      expect(reseatExpandedAfterRemoval(new Set([0, 1, 2]), 2)).toEqual(new Set([0, 1]));
    });

    it('is a no-op on an empty set', () => {
      expect(reseatExpandedAfterRemoval(new Set(), 0)).toEqual(new Set());
    });

    it('drops the removed index even when it is not in the set', () => {
      expect(reseatExpandedAfterRemoval(new Set([0, 3]), 1)).toEqual(new Set([0, 2]));
    });
  });
});
