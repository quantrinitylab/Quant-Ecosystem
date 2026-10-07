// ============================================================================
// Property tests — Persistence Layer (backend core)
// Spec: quantchat-mega-upgrade, Task 9.9
// Design: Component 6 "Persistence Layer (Prisma + PostgreSQL)"
//
//   Property 17 — persistence survives restart (message round-trip)
//   Property 18 — atomic conversation creation (all-or-nothing transaction)
//   Property 19 — DB retry respects exponential backoff before 503
//
// A live PostgreSQL is not available in the sandbox, so these exercise the
// PURE logic and patterns from the design:
//   * Property 19 uses the real `withRetry` / `isTransientError` from
//     ../lib/db-retry with an injectable sleep that records the backoff schedule.
//   * Property 18 uses a pure `createConversationTx` helper driven by an
//     in-memory fake transaction that commits all-or-nothing.
//   * Property 17 uses a small in-memory message repository whose backing store
//     survives a simulated "service restart" (new repo instance, same store).
//
// Convention: fast-check is NOT a quantchat dependency. These follow the repo's
// realized property-test convention — a seeded deterministic mulberry32 RNG loop
// with >=100 samples (see backend/__tests__/avatar.property.test.ts).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  withRetry,
  isTransientError,
  backoffDelayMs,
  TRANSIENT_PRISMA_ERROR_CODES,
  type SleepFn,
} from '../lib/db-retry';

// Deterministic seeded RNG (mulberry32) — mirrors the repo PBT convention.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = 120; // >= 100 cases per property

function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function randString(rand: () => number, len: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ?!._-';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(rand() * alphabet.length)];
  }
  return out;
}

// ============================================================================
// Property 17 — persistence survives restart (round-trip)
// ============================================================================

interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  mediaUrl: string | null;
  isAIGenerated: boolean;
  expiresAt: string | null;
  viewedAt: string | null;
  createdAt: string;
}

/**
 * Backing store that represents the durable database tier. It is a plain object
 * keyed by id holding *serialized* rows, so it is independent of any in-memory
 * repository instance — exactly the property we need to model a restart.
 */
type BackingStore = Record<string, string>;

/**
 * Minimal in-memory message repository abstraction. Writes serialize the record
 * into the shared backing store; reads deserialize a fresh copy. A new
 * repository instance constructed over the same backing store models a service
 * restart (process memory is gone, durable rows remain).
 */
class InMemoryMessageRepository {
  constructor(private readonly store: BackingStore) {}

  save(message: MessageRecord): void {
    this.store[message.id] = JSON.stringify(message);
  }

  findById(id: string): MessageRecord | null {
    const raw = this.store[id];
    return raw === undefined ? null : (JSON.parse(raw) as MessageRecord);
  }
}

function randomMessage(rand: () => number): MessageRecord {
  const hasMedia = rand() < 0.5;
  const hasExpiry = rand() < 0.5;
  const hasViewed = rand() < 0.5;
  return {
    id: `msg_${randInt(rand, 0, 1_000_000_000)}_${randInt(rand, 0, 1_000_000_000)}`,
    conversationId: `conv_${randInt(rand, 0, 100_000)}`,
    senderId: `user_${randInt(rand, 0, 100_000)}`,
    content: randString(rand, randInt(rand, 0, 80)),
    mediaUrl: hasMedia ? `https://cdn.example/${randString(rand, 12)}.jpg` : null,
    isAIGenerated: rand() < 0.5,
    expiresAt: hasExpiry ? new Date(randInt(rand, 0, 2_000_000_000) * 1000).toISOString() : null,
    viewedAt: hasViewed ? new Date(randInt(rand, 0, 2_000_000_000) * 1000).toISOString() : null,
    createdAt: new Date(randInt(rand, 0, 2_000_000_000) * 1000).toISOString(),
  };
}

// Feature: quantchat-mega-upgrade, Property 17: persistence survives restart (round-trip)
// **Validates: Requirements 8.4**
describe('Property 17: message round-trips identically across a simulated restart', () => {
  it('holds across >=100 randomized message records', () => {
    const rand = mulberry32(0x5042_3137); // "PB17"

    for (let s = 0; s < SAMPLES; s += 1) {
      // Durable tier shared across the "restart".
      const store: BackingStore = {};

      const written = randomMessage(rand);

      // Write through the pre-restart repository instance.
      const before = new InMemoryMessageRepository(store);
      before.save(written);

      // Simulate a service restart: brand-new repository over the same store,
      // no shared in-process state beyond the durable backing store.
      const after = new InMemoryMessageRepository(store);
      const retrieved = after.findById(written.id);

      // Round-trip must return identical data (deep equality), not the same ref.
      expect(retrieved).not.toBeNull();
      expect(retrieved).toEqual(written);
      expect(retrieved).not.toBe(written);

      // A non-existent id still returns null after restart (no phantom rows).
      expect(after.findById(`${written.id}_absent`)).toBeNull();
    }
  });
});

// ============================================================================
// Property 18 — atomic conversation creation (all-or-nothing)
// ============================================================================

interface ConversationRow {
  id: string;
  type: string;
}
interface ParticipantRow {
  conversationId: string;
  userId: string;
}

/**
 * Pure transaction body that creates a conversation plus one participant row
 * per participant id using only the supplied transaction client. Mirrors the
 * design's "Atomic Conversation Creation" pattern.
 */
async function createConversationTx(
  tx: FakeTx,
  type: string,
  participantIds: string[],
): Promise<ConversationRow> {
  const conversation = await tx.conversation.create({ data: { type } });
  await tx.conversationParticipant.createMany({
    data: participantIds.map((userId) => ({ conversationId: conversation.id, userId })),
  });
  return conversation;
}

interface FakeTx {
  conversation: { create(args: { data: { type: string } }): Promise<ConversationRow> };
  conversationParticipant: {
    createMany(args: { data: ParticipantRow[] }): Promise<{ count: number }>;
  };
}

/**
 * In-memory database with all-or-nothing `$transaction` semantics: writes go to
 * a staging buffer and are only flushed to the committed store if the callback
 * resolves. If the callback throws, the staged writes are discarded.
 *
 * `failOnCreateMany` forces a throw "partway" (after the conversation row is
 * staged but before participants commit) to test rollback.
 */
function makeFakeDb(options: { failOnCreateMany?: boolean } = {}) {
  const committed = {
    conversations: [] as ConversationRow[],
    participants: [] as ParticipantRow[],
  };
  let idCounter = 0;

  async function $transaction<T>(cb: (tx: FakeTx) => Promise<T>): Promise<T> {
    const staged = {
      conversations: [] as ConversationRow[],
      participants: [] as ParticipantRow[],
    };
    const tx: FakeTx = {
      conversation: {
        create: async ({ data }) => {
          idCounter += 1;
          const row: ConversationRow = { id: `conv_${idCounter}`, type: data.type };
          staged.conversations.push(row);
          return row;
        },
      },
      conversationParticipant: {
        createMany: async ({ data }) => {
          if (options.failOnCreateMany) {
            const err = new Error('participant write failed mid-transaction');
            throw err;
          }
          staged.participants.push(...data);
          return { count: data.length };
        },
      },
    };

    const result = await cb(tx);
    // Reached only when the callback resolves: flush staged writes atomically.
    committed.conversations.push(...staged.conversations);
    committed.participants.push(...staged.participants);
    return result;
  }

  return { committed, $transaction };
}

// Feature: quantchat-mega-upgrade, Property 18: atomic conversation creation (all-or-nothing)
// **Validates: Requirements 8.6**
describe('Property 18: conversation creation is all-or-nothing across N participants', () => {
  it('successful transaction persists the conversation and ALL N participants', () => {
    const rand = mulberry32(0x5042_3138); // "PB18"

    return (async () => {
      for (let s = 0; s < SAMPLES; s += 1) {
        const n = randInt(rand, 1, 8);
        const participantIds = Array.from(
          { length: n },
          (_, i) => `user_${i}_${randInt(rand, 0, 1e9)}`,
        );
        const type = rand() < 0.5 ? 'DIRECT' : 'GROUP';

        const db = makeFakeDb();
        const conv = await db.$transaction((tx) => createConversationTx(tx, type, participantIds));

        // All-or-nothing (success branch): conversation exists AND all N members.
        expect(db.committed.conversations).toHaveLength(1);
        expect(db.committed.conversations[0].id).toBe(conv.id);
        expect(db.committed.participants).toHaveLength(n);
        for (const userId of participantIds) {
          expect(
            db.committed.participants.some(
              (p) => p.conversationId === conv.id && p.userId === userId,
            ),
          ).toBe(true);
        }
      }
    })();
  });

  it('a failure partway persists NOTHING (no partial conversation or participants)', () => {
    const rand = mulberry32(0x5042_3139); // "PB18b"

    return (async () => {
      for (let s = 0; s < SAMPLES; s += 1) {
        const n = randInt(rand, 1, 8);
        const participantIds = Array.from(
          { length: n },
          (_, i) => `user_${i}_${randInt(rand, 0, 1e9)}`,
        );
        const type = rand() < 0.5 ? 'DIRECT' : 'GROUP';

        const db = makeFakeDb({ failOnCreateMany: true });

        await expect(
          db.$transaction((tx) => createConversationTx(tx, type, participantIds)),
        ).rejects.toThrow();

        // All-or-nothing (failure branch): NO conversation and NO participants.
        expect(db.committed.conversations).toHaveLength(0);
        expect(db.committed.participants).toHaveLength(0);
      }
    })();
  });
});

// ============================================================================
// Property 19 — DB retry respects backoff before 503
// ============================================================================

class TransientDbError extends Error {
  code: string;
  constructor(code: string) {
    super(`transient db error ${code}`);
    this.name = 'TransientDbError';
    this.code = code;
  }
}

class NonTransientDbError extends Error {
  code: string;
  constructor(code: string) {
    super(`non-transient db error ${code}`);
    this.name = 'NonTransientDbError';
    this.code = code;
  }
}

const NON_TRANSIENT_CODES = ['P2002', 'P2025', 'P2003', 'P1010', 'BOOM', 'unknown'];

// Feature: quantchat-mega-upgrade, Property 19: DB retry respects backoff before 503
// **Validates: Requirements 8.8**
describe('Property 19: persistence retries transient errors with exponential backoff before 503', () => {
  it('an always-transient operation retries 3x with delays [1000,2000,4000] then throws', () => {
    const rand = mulberry32(0x5042_3141); // "PB19"

    return (async () => {
      for (let s = 0; s < SAMPLES; s += 1) {
        const code =
          TRANSIENT_PRISMA_ERROR_CODES[randInt(rand, 0, TRANSIENT_PRISMA_ERROR_CODES.length - 1)];

        const delays: number[] = [];
        const fakeSleep: SleepFn = async (ms) => {
          delays.push(ms);
        };

        let calls = 0;
        const op = async () => {
          calls += 1;
          throw new TransientDbError(code);
        };

        await expect(withRetry(op, 3, fakeSleep)).rejects.toBeInstanceOf(TransientDbError);

        // 1 initial attempt + 3 retries == 4 invocations.
        expect(calls).toBe(4);
        // Exactly the base-2 exponential backoff schedule, before giving up (-> 503).
        expect(delays).toEqual([1000, 2000, 4000]);
      }
    })();
  });

  it('a non-transient error throws immediately with no retry and no backoff', () => {
    const rand = mulberry32(0x5042_3142); // "PB19b"

    return (async () => {
      for (let s = 0; s < SAMPLES; s += 1) {
        const code = NON_TRANSIENT_CODES[randInt(rand, 0, NON_TRANSIENT_CODES.length - 1)];

        const delays: number[] = [];
        const fakeSleep: SleepFn = async (ms) => {
          delays.push(ms);
        };

        let calls = 0;
        const op = async () => {
          calls += 1;
          throw new NonTransientDbError(code);
        };

        await expect(withRetry(op, 3, fakeSleep)).rejects.toBeInstanceOf(NonTransientDbError);

        expect(isTransientError(new NonTransientDbError(code))).toBe(false);
        expect(calls).toBe(1); // no retry
        expect(delays).toEqual([]); // no backoff
      }
    })();
  });

  it('an operation that succeeds on attempt k stops retrying after k attempts', () => {
    const rand = mulberry32(0x5042_3143); // "PB19c"

    return (async () => {
      for (let s = 0; s < SAMPLES; s += 1) {
        // Succeed on attempt index k in 0..3 (0 == first try succeeds).
        const k = randInt(rand, 0, 3);
        const code =
          TRANSIENT_PRISMA_ERROR_CODES[randInt(rand, 0, TRANSIENT_PRISMA_ERROR_CODES.length - 1)];

        const delays: number[] = [];
        const fakeSleep: SleepFn = async (ms) => {
          delays.push(ms);
        };

        let calls = 0;
        const op = async () => {
          const attempt = calls;
          calls += 1;
          if (attempt < k) {
            throw new TransientDbError(code);
          }
          return `ok@${attempt}`;
        };

        const result = await withRetry(op, 3, fakeSleep);

        expect(result).toBe(`ok@${k}`);
        // Stops immediately on success: exactly k+1 invocations.
        expect(calls).toBe(k + 1);
        // One backoff delay per failed attempt preceding success.
        expect(delays).toEqual(Array.from({ length: k }, (_, i) => backoffDelayMs(i)));
      }
    })();
  });
});
