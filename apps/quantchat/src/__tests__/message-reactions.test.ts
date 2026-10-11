// QC-F-020 — persisted reaction model (src/lib/message-reactions).
//
// Before the fix the thread page kept reactions in local useState only:
// they vanished on reload, other members never saw them, and the same
// user could append unlimited duplicates. The persisted shape is the
// backend's message metadata: { reactions: { [emoji]: userId[] } }.
import { describe, it, expect } from 'vitest';
import {
  reactionsFromMetadata,
  expandReactions,
  toggleUserReaction,
} from '../lib/message-reactions';

describe('reactionsFromMetadata', () => {
  it('extracts the persisted emoji -> userIds map', () => {
    expect(
      reactionsFromMetadata({ reactions: { '❤️': ['u1', 'u2'], '👍': ['u1'] }, pinned: true }),
    ).toEqual({ '❤️': ['u1', 'u2'], '👍': ['u1'] });
  });

  it('returns {} for missing or malformed metadata', () => {
    expect(reactionsFromMetadata(undefined)).toEqual({});
    expect(reactionsFromMetadata(null)).toEqual({});
    expect(reactionsFromMetadata({})).toEqual({});
    expect(reactionsFromMetadata({ reactions: 'nope' })).toEqual({});
    expect(reactionsFromMetadata({ reactions: { '👍': 'u1' } })).toEqual({});
    expect(reactionsFromMetadata({ reactions: { '👍': [] } })).toEqual({});
  });

  it('drops non-string user ids instead of trusting the payload', () => {
    expect(reactionsFromMetadata({ reactions: { '👍': ['u1', 42, null] } })).toEqual({
      '👍': ['u1'],
    });
  });
});

describe('expandReactions', () => {
  it('expands one emoji per reacting user (count = number of reactions)', () => {
    expect(expandReactions({ '❤️': ['u1', 'u2'], '👍': ['u1'] }).sort()).toEqual(
      ['❤️', '❤️', '👍'].sort(),
    );
  });

  it('expands an empty map to an empty list', () => {
    expect(expandReactions({})).toEqual([]);
  });
});

describe('toggleUserReaction (mirrors backend toggle semantics)', () => {
  it('adds the user when they have not reacted with that emoji', () => {
    expect(toggleUserReaction({}, 'u1', '👍')).toEqual({ '👍': ['u1'] });
    expect(toggleUserReaction({ '👍': ['u2'] }, 'u1', '👍')).toEqual({ '👍': ['u2', 'u1'] });
  });

  it('removes the user when they already reacted (toggle off, no duplicates)', () => {
    expect(toggleUserReaction({ '👍': ['u1', 'u2'] }, 'u1', '👍')).toEqual({ '👍': ['u2'] });
    expect(toggleUserReaction({ '👍': ['u1'] }, 'u1', '👍')).toEqual({});
  });

  it('never mutates the input map', () => {
    const before = { '👍': ['u1'] };
    toggleUserReaction(before, 'u2', '👍');
    expect(before).toEqual({ '👍': ['u1'] });
  });
});
