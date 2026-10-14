// QC-F-331 Slice 1 — Snap Map friend search (pure filter).
//
// The map page's "Search locations..." input was completely dead (no value,
// no onChange, no aria-label). Slice 1 wires it to the ONLY real corpus the
// page has: the friends list already loaded from GET /api/map/friends
// (close friends sharing their location, server-side privacy gates applied).
// These tests pin the pure filter (src/app/map/friendSearch.ts):
//   - empty/whitespace query returns the whole list, order preserved,
//     input array never mutated;
//   - matching is substring, case-insensitive, over username + displayName
//     ONLY — never userId, never coordinates;
//   - no match means an empty result — nothing is ever invented or
//     "nearest" substituted.
import { describe, it, expect } from 'vitest';
import { filterFriendsOnMap } from '../app/map/friendSearch';
import type { FriendLocation } from '../components/map';

function friend(partial: Partial<FriendLocation> & { userId: string }): FriendLocation {
  return {
    username: '',
    avatarUrl: '',
    position: [77.2, 28.6],
    lastUpdated: new Date('2026-10-14T00:00:00Z'),
    isOnline: false,
    ...partial,
  };
}

const FRIENDS: FriendLocation[] = [
  friend({ userId: 'u-alina', username: 'alina_k', displayName: 'Alina Kapoor' }),
  friend({ userId: 'u-rk', username: 'rk_92', displayName: 'Ramesh Kumar' }),
  friend({ userId: 'u-sana', username: 'sana', displayName: 'Sana Sheikh' }),
];

describe('QC-F-331 filterFriendsOnMap', () => {
  it('A1: empty query returns the whole list in order, without mutating the input', () => {
    const input = [...FRIENDS];
    const result = filterFriendsOnMap(input, '');
    expect(result.map((f) => f.userId)).toEqual(['u-alina', 'u-rk', 'u-sana']);
    expect(result).not.toBe(input);
    expect(result[0]).toBe(input[0]);
    expect(input).toEqual(FRIENDS);
  });

  it('A2: whitespace-only query behaves like an empty query', () => {
    const result = filterFriendsOnMap(FRIENDS, '   ');
    expect(result.map((f) => f.userId)).toEqual(['u-alina', 'u-rk', 'u-sana']);
  });

  it('A3: username substring match is case-insensitive', () => {
    const result = filterFriendsOnMap(FRIENDS, 'ALI');
    expect(result.map((f) => f.userId)).toEqual(['u-alina']);
  });

  it('A4: displayName matches when the username does not', () => {
    const result = filterFriendsOnMap(FRIENDS, 'ramesh');
    expect(result.map((f) => f.userId)).toEqual(['u-rk']);
  });

  it('A5: surrounding spaces in the query are trimmed', () => {
    const spaced = filterFriendsOnMap(FRIENDS, '  ali  ');
    const plain = filterFriendsOnMap(FRIENDS, 'ali');
    expect(spaced.map((f) => f.userId)).toEqual(plain.map((f) => f.userId));
    expect(spaced.map((f) => f.userId)).toEqual(['u-alina']);
  });

  it('A6: no match returns an empty array — nothing invented, nothing substituted', () => {
    const result = filterFriendsOnMap(FRIENDS, 'zzzz-no-such-friend');
    expect(result).toEqual([]);
    expect(result.length).toBe(0);
  });

  it('A7: matching uses name fields only — never userId or coordinates', () => {
    // 'u-rk' is a userId fragment; '28.6' is a latitude fragment. Neither is
    // part of any name, so neither may produce a match.
    expect(filterFriendsOnMap(FRIENDS, 'u-rk')).toEqual([]);
    expect(filterFriendsOnMap(FRIENDS, '28.6')).toEqual([]);
    expect(filterFriendsOnMap(FRIENDS, '77.2')).toEqual([]);
  });

  it('A8: multiple matches keep backend order and a friend matching both fields appears once', () => {
    const both = [
      friend({ userId: 'u-1', username: 'sana', displayName: 'Sana Sheikh' }),
      friend({ userId: 'u-2', username: 'kabir', displayName: 'Kabir Sana' }),
      friend({ userId: 'u-3', username: 'dev', displayName: 'Dev Patel' }),
    ];
    const result = filterFriendsOnMap(both, 'sana');
    expect(result.map((f) => f.userId)).toEqual(['u-1', 'u-2']);
  });
});
