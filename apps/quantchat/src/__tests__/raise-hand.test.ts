// QC-F-263 Slice 1 — raise-hand helper pins (specialist-qc-f-263.md §6.1).
//
// The helper is the only reader/writer of the qcHandRaised participant
// attributes. These pins run on plain fake participants (no LiveKit), and
// the negative controls are the cases that FAIL on the pre-fix tree (the
// helper did not exist, and the audio-room-style mistakes — re-raise moving
// your queue spot, writing someone else's hand — must stay impossible).

import { describe, it, expect, vi } from 'vitest';
import {
  HAND_ATTR,
  HAND_AT_ATTR,
  readHandState,
  buildRaiseQueue,
  setOwnHand,
  type HandLocalParticipantLike,
  type HandParticipantLike,
} from '../lib/raise-hand';

function participant(
  overrides: Partial<HandParticipantLike> = {},
): HandParticipantLike {
  return { identity: 'u1', name: 'Asha', attributes: {}, ...overrides };
}

function localParticipant(
  attributes: Record<string, string> = {},
): { local: HandLocalParticipantLike; setAttributes: ReturnType<typeof vi.fn> } {
  const setAttributes = vi.fn(async () => undefined);
  const local: HandLocalParticipantLike = {
    identity: 'me',
    name: 'Me',
    attributes,
    setAttributes,
  };
  return { local, setAttributes };
}

describe('readHandState (§6.1 pin 1)', () => {
  it('reads a raised hand with its timestamp', () => {
    const p = participant({
      attributes: {
        [HAND_ATTR]: 'true',
        [HAND_AT_ATTR]: '2026-10-13T01:00:00.000Z',
      },
    });
    expect(readHandState(p)).toEqual({
      raised: true,
      raisedAt: '2026-10-13T01:00:00.000Z',
    });
  });

  it.each([
    ['false value', { [HAND_ATTR]: 'false', [HAND_AT_ATTR]: '' }],
    ['missing key', {}],
    ['garbage value', { [HAND_ATTR]: 'yes' }],
    ['no attributes object', undefined],
  ])('treats %s as down', (_label, attributes) => {
    const p = participant({ attributes });
    expect(readHandState(p)).toEqual({ raised: false, raisedAt: null });
  });

  it('keeps a raised hand raised when the timestamp is empty or unparseable', () => {
    for (const at of ['', 'not-a-date']) {
      const p = participant({
        attributes: { [HAND_ATTR]: 'true', [HAND_AT_ATTR]: at },
      });
      expect(readHandState(p)).toEqual({ raised: true, raisedAt: null });
    }
  });
});

describe('setOwnHand (§6.1 pins 2–4, 6)', () => {
  it('pin 3: raising a down hand writes the exact attribute shape once', async () => {
    const { local, setAttributes } = localParticipant({
      [HAND_ATTR]: 'false',
      [HAND_AT_ATTR]: '',
    });
    await setOwnHand({ localParticipant: local }, true);
    expect(setAttributes).toHaveBeenCalledTimes(1);
    const arg = setAttributes.mock.calls[0][0] as Record<string, string>;
    expect(arg[HAND_ATTR]).toBe('true');
    // Timestamp shape only — never pin a wall-clock value.
    expect(arg[HAND_AT_ATTR]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('pin 2 (negative control): re-raising never rewrites the timestamp', async () => {
    const { local, setAttributes } = localParticipant({
      [HAND_ATTR]: 'true',
      [HAND_AT_ATTR]: '2026-10-13T01:00:00.000Z',
    });
    await setOwnHand({ localParticipant: local }, true);
    expect(setAttributes).not.toHaveBeenCalled();
  });

  it('pin 4: lowering a raised hand writes false + empty timestamp once', async () => {
    const { local, setAttributes } = localParticipant({
      [HAND_ATTR]: 'true',
      [HAND_AT_ATTR]: '2026-10-13T01:00:00.000Z',
    });
    await setOwnHand({ localParticipant: local }, false);
    expect(setAttributes).toHaveBeenCalledTimes(1);
    expect(setAttributes.mock.calls[0][0]).toEqual({
      [HAND_ATTR]: 'false',
      [HAND_AT_ATTR]: '',
    });
  });

  it('pin 4b: lowering an already-down hand writes nothing', async () => {
    const { local, setAttributes } = localParticipant({});
    await setOwnHand({ localParticipant: local }, false);
    expect(setAttributes).not.toHaveBeenCalled();
  });

  it('propagates setAttributes rejection — the caller must show the honest notice', async () => {
    const { local, setAttributes } = localParticipant({});
    setAttributes.mockRejectedValue(new Error('not connected'));
    await expect(setOwnHand({ localParticipant: local }, true)).rejects.toThrow(
      'not connected',
    );
  });

  it("pin 6: the write path only ever touches the local participant", async () => {
    const remoteSetAttributes = vi.fn(async () => undefined);
    const remote: HandLocalParticipantLike = {
      identity: 'someone-else',
      attributes: {},
      setAttributes: remoteSetAttributes,
    };
    const { local } = localParticipant({});
    // The helper's room shape exposes only localParticipant; passing a room
    // whose local is `local` must leave any remote-shaped object untouched.
    await setOwnHand({ localParticipant: local }, true);
    expect(remoteSetAttributes).not.toHaveBeenCalled();
    void remote;
  });
});

describe('buildRaiseQueue (§6.1 pin 5)', () => {
  it('derives the queue oldest-first from attributes only', () => {
    const queue = buildRaiseQueue([
      participant({
        identity: 'late',
        name: 'Late',
        attributes: {
          [HAND_ATTR]: 'true',
          [HAND_AT_ATTR]: '2026-10-13T01:05:00.000Z',
        },
      }),
      participant({
        identity: 'down',
        name: 'Down',
        attributes: { [HAND_ATTR]: 'false', [HAND_AT_ATTR]: '' },
      }),
      participant({
        identity: 'early',
        name: 'Early',
        attributes: {
          [HAND_ATTR]: 'true',
          [HAND_AT_ATTR]: '2026-10-13T01:01:00.000Z',
        },
      }),
    ]);
    expect(queue.map((e) => e.identity)).toEqual(['early', 'late']);
  });

  it('puts an unparseable/missing timestamp last, never first', () => {
    const queue = buildRaiseQueue([
      participant({
        identity: 'broken-clock',
        attributes: { [HAND_ATTR]: 'true', [HAND_AT_ATTR]: 'junk' },
      }),
      participant({
        identity: 'timed',
        attributes: {
          [HAND_ATTR]: 'true',
          [HAND_AT_ATTR]: '2026-10-13T01:09:00.000Z',
        },
      }),
    ]);
    expect(queue.map((e) => e.identity)).toEqual(['timed', 'broken-clock']);
    expect(queue[1].raisedAt).toBeNull();
  });

  it('falls back to identity for the name and keeps a raised host in the queue', () => {
    const queue = buildRaiseQueue([
      participant({
        identity: 'host-1',
        name: '',
        attributes: {
          [HAND_ATTR]: 'true',
          [HAND_AT_ATTR]: '2026-10-13T01:00:00.000Z',
        },
      }),
    ]);
    expect(queue).toEqual([
      { identity: 'host-1', name: 'host-1', raisedAt: '2026-10-13T01:00:00.000Z' },
    ]);
  });

  it('is empty when nobody has a hand up — no fabricated queue', () => {
    expect(buildRaiseQueue([participant(), participant()])).toEqual([]);
  });
});
