// ============================================================================
// QuantChat — Raise Hand (QC-F-263 Slice 1)
// ============================================================================
//
// Raise-hand state for meetings/calls lives ONLY in LiveKit participant
// attributes (specialist-qc-f-263.md §2.1, Band A):
//
//   qcHandRaised    'true' | 'false'   (the key is never deleted/unset —
//                                      LiveKit's client API has no clean
//                                      key-removal, and an explicit value
//                                      is testable in every state)
//   qcHandRaisedAt  ISO-8601 string    ('' when the hand is down; drives
//                                      the queue order, §2.3)
//
// Why attributes and not a data packet or a backend store: attributes ride
// with the participant on the SFU, so a late joiner sees the true queue on
// their first render, a lost packet can never fabricate state, and no new
// backend/migration/proxy is needed (the design is independent of QC-F-173).
// Only the owner can write their own attributes — a hand can never be
// raised in someone else's name (identity is bound to the SFU token).
//
// Honesty rule (§2.4): this module never invents state. Callers derive the
// UI from readHandState()/buildRaiseQueue() over the real participants; a
// failed setAttributes must surface as an error, never as an optimistic
// "raised" UI.

export const HAND_ATTR = 'qcHandRaised';
export const HAND_AT_ATTR = 'qcHandRaisedAt';

/** The slice of a LiveKit Participant this module reads. */
export interface HandParticipantLike {
  identity: string;
  name?: string;
  attributes?: Readonly<Record<string, string>>;
}

/** The slice of a LiveKit LocalParticipant this module writes through. */
export interface HandLocalParticipantLike extends HandParticipantLike {
  setAttributes(attributes: Record<string, string>): Promise<void>;
}

/** The slice of a LiveKit Room this module needs. */
export interface HandRoomLike {
  localParticipant: HandLocalParticipantLike;
}

export interface HandState {
  raised: boolean;
  /** ISO timestamp of the raise, or null when down / unparseable. */
  raisedAt: string | null;
}

export interface RaiseQueueEntry {
  identity: string;
  name: string;
  /** ISO timestamp, or null when the raise time is missing/unparseable. */
  raisedAt: string | null;
}

function parseRaisedAt(raw: string | undefined): string | null {
  if (!raw) return null;
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

/**
 * Read one participant's hand state from their attributes. Only the exact
 * value 'true' counts as raised — anything else (missing, 'false', garbage)
 * is down. A raised hand with a missing/unparseable timestamp is still
 * raised; only its queue position degrades (see buildRaiseQueue).
 */
export function readHandState(participant: HandParticipantLike): HandState {
  const attrs = participant.attributes ?? {};
  if (attrs[HAND_ATTR] !== 'true') {
    return { raised: false, raisedAt: null };
  }
  return { raised: true, raisedAt: parseRaisedAt(attrs[HAND_AT_ATTR]) };
}

/**
 * Derive the raise queue from the real participant list (§2.3): everyone
 * whose hand is up, oldest raise first. Entries whose timestamp is missing
 * or unparseable go LAST — a broken clock must never jump the queue. The
 * host is NOT excluded: a raised host hand shows in the queue like anyone
 * else's. No counter is stored anywhere; this derivation is the only truth.
 */
export function buildRaiseQueue(
  participants: readonly HandParticipantLike[],
): RaiseQueueEntry[] {
  const entries: RaiseQueueEntry[] = [];
  for (const p of participants) {
    const state = readHandState(p);
    if (!state.raised) continue;
    entries.push({
      identity: p.identity,
      name: p.name || p.identity,
      raisedAt: state.raisedAt,
    });
  }
  entries.sort((a, b) => {
    if (a.raisedAt && b.raisedAt) {
      return Date.parse(a.raisedAt) - Date.parse(b.raisedAt);
    }
    if (a.raisedAt) return -1; // timed entries before untimed
    if (b.raisedAt) return 1;
    return 0;
  });
  return entries;
}

/**
 * Raise or lower the LOCAL participant's hand via their own attributes —
 * the only write path in this design (a remote participant's attributes are
 * never touched here; LiveKit would reject it and the design forbids it).
 *
 * Idempotency (§2.1): raising an already-raised hand is a no-op and the
 * original qcHandRaisedAt is preserved, so re-raising can never steal a
 * better queue position. Lowering an already-down hand is also a no-op.
 *
 * Rejections from setAttributes (e.g. connection lost) propagate to the
 * caller, which must show the honest §2.4 notice — never fake success.
 */
export async function setOwnHand(room: HandRoomLike, raised: boolean): Promise<void> {
  const local = room.localParticipant;
  const current = readHandState(local);
  if (current.raised === raised) return;
  if (raised) {
    await local.setAttributes({
      [HAND_ATTR]: 'true',
      [HAND_AT_ATTR]: new Date().toISOString(),
    });
  } else {
    await local.setAttributes({
      [HAND_ATTR]: 'false',
      [HAND_AT_ATTR]: '',
    });
  }
}
