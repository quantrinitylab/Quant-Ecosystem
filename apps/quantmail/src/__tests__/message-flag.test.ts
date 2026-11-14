import { describe, it, expect } from 'vitest';
import {
  readFlag,
  anyFlagged,
  allConversationsFlagged,
  flagChangeIds,
  settleFlags,
} from '../lib/message-flag';

describe('message-flag pure helpers', () => {
  describe('readFlag', () => {
    it('returns true only for explicit boolean true', () => {
      expect(readFlag({ isFlagged: true })).toBe(true);
      expect(readFlag({ isFlagged: false })).toBe(false);
      expect(readFlag({ isFlagged: null })).toBe(false);
      expect(readFlag({ isFlagged: undefined })).toBe(false);
      expect(readFlag({})).toBe(false);
      expect(readFlag(null)).toBe(false);
      expect(readFlag(undefined)).toBe(false);
    });
  });

  describe('anyFlagged', () => {
    it('returns true if any message is flagged', () => {
      expect(anyFlagged([{ isFlagged: false }, { isFlagged: true }])).toBe(true);
      expect(anyFlagged([{ isFlagged: false }, { isFlagged: false }])).toBe(false);
      expect(anyFlagged([])).toBe(false);
      expect(anyFlagged(null)).toBe(false);
    });
  });

  describe('allConversationsFlagged (AC-20, MEDIUM 7)', () => {
    const threads = [
      { id: 't1', messages: [{ id: 'm1' }], isFlagged: true },
      { id: 't2', messages: [{ id: 'm2' }], isFlagged: false },
      { id: 't3', messages: [{ id: 'm3' }], isFlagged: false },
      { id: 't4', messages: [{ id: 'm4' }], isFlagged: true },
    ];

    it('returns false for empty selectedIds', () => {
      expect(allConversationsFlagged(threads, [])).toBe(false);
    });

    it('returns false when any conversation is not flagged [flagged, unflagged, unflagged]', () => {
      expect(allConversationsFlagged(threads, ['t1', 't2', 't3'])).toBe(false);
    });

    it('returns true when all selected conversations are flagged [t1, t4]', () => {
      expect(allConversationsFlagged(threads, ['t1', 't4'])).toBe(true);
    });

    it('returns false when an ID matches no thread (missing reads as not flagged)', () => {
      expect(allConversationsFlagged(threads, ['t1', 'missing-id'])).toBe(false);
    });

    it('resolves by message id or threadId as fallback', () => {
      const complexThreads = [
        { id: 'thread-root-1', threadId: 't-real-1', messages: [{ id: 'm-sub-1' }], isFlagged: true },
      ];
      expect(allConversationsFlagged(complexThreads, ['m-sub-1'])).toBe(true);
      expect(allConversationsFlagged(complexThreads, ['t-real-1'])).toBe(true);
    });
  });

  describe('flagChangeIds', () => {
    it('returns only ids of messages that need to change, including collapsedIds', () => {
      const messages = [
        { id: 'm1', isFlagged: false, collapsedIds: ['m1-dup'] },
        { id: 'm2', isFlagged: true },
        { id: 'm3', isFlagged: false },
      ];

      // target true: m1 and m3 must change, including m1-dup
      expect(flagChangeIds(messages, true)).toEqual(['m1', 'm1-dup', 'm3']);

      // target false: only m2 must change
      expect(flagChangeIds(messages, false)).toEqual(['m2']);
    });
  });

  describe('settleFlags', () => {
    it('handles target true with partial failure', () => {
      const messages = [
        { id: 'm1', isFlagged: false, collapsedIds: ['m1-dup'] },
        { id: 'm2', isFlagged: false },
      ];

      // target true, only m1-dup succeeded -> m1 is flagged
      const accepted = new Set(['m1-dup']);
      const settled = settleFlags(messages, true, accepted);
      expect(settled.get('m1')).toBe(true);
      expect(settled.get('m2')).toBe(false);
    });

    it('handles target false: unflags only if ALL rowIds were accepted', () => {
      const messages = [
        { id: 'm1', isFlagged: true, collapsedIds: ['m1-dup'] },
      ];

      // only m1 accepted, m1-dup failed -> remains true
      const partialAccepted = new Set(['m1']);
      expect(settleFlags(messages, false, partialAccepted).get('m1')).toBe(true);

      // both accepted -> becomes false
      const allAccepted = new Set(['m1', 'm1-dup']);
      expect(settleFlags(messages, false, allAccepted).get('m1')).toBe(false);
    });
  });
});
