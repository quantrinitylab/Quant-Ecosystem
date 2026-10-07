// ============================================================================
// Property tests — Quant AI Agent (backend core)
// Spec: quantchat-mega-upgrade, Task 12.10
//
// Covers the three Quant AI Agent invariants:
//
//   Property 31 — AI suggestions limited to 3        (Requirements 11.3)
//   Property 32 — Scheduled message delivery within tolerance [T, T+60s]
//                                                     (Requirements 11.4)
//   Property 33 — AI-generated content always labeled (Requirements 11.8)
//
// Convention: fast-check is NOT a quantchat dependency. These follow the repo's
// realized property-test convention — a seeded deterministic mulberry32 RNG loop
// with >=100 samples (see avatar.property.test.ts in this package).
//
// The example-based tests live in the sibling ai-agent.test.ts; this is a
// SEPARATE property-test file.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  QuantAIAgent,
  templateSuggestions,
  CONTENT_TYPES,
  type ChatMessage,
  type ContentType,
} from '../lib/ai-agent';
import {
  ScheduledMessageWorker,
  SCHEDULED_POLL_INTERVAL_MS,
  SCHEDULED_DELIVERY_TOLERANCE_MS,
  type ScheduledMessageRecord,
} from '../services/scheduled-message-worker';

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

const SAMPLES = 120; // >= 100 cases

function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

// A bank of varied phrase fragments so generated text exercises every branch of
// the template generators (questions, greetings, thanks, plans, plain text).
const WORD_BANK = [
  'hey',
  'hello',
  'what time works for dinner?',
  'thanks so much',
  'lets meet tonight',
  'are we still on?',
  'lol gonna be fun',
  'see you tomorrow',
  'random text here',
  'how are you doing',
  'sorry about that',
  'sounds good to me',
  '',
  'plan for the weekend?',
  'omg yes',
  'ok',
];

const SENDERS = ['alice', 'bob', 'me', 'carol', 'dave'];

function randomConversation(rand: () => number): ChatMessage[] {
  const count = randInt(rand, 0, 12); // varying message counts, incl. empty
  const messages: ChatMessage[] = [];
  for (let i = 0; i < count; i += 1) {
    // Concatenate 1-3 fragments to vary text length/shape.
    const parts = randInt(rand, 1, 3);
    let content = '';
    for (let p = 0; p < parts; p += 1) {
      content = `${content} ${pick(rand, WORD_BANK)}`.trim();
    }
    messages.push({
      sender: pick(rand, SENDERS),
      content,
      isSelf: rand() < 0.5,
    });
  }
  return messages;
}

// ----------------------------------------------------------------------------
// Feature: quantchat-mega-upgrade, Property 31: AI suggestions limited to 3
// **Validates: Requirements 11.3**
// ----------------------------------------------------------------------------
describe('Property 31: AI suggestion generator produces at most 3 suggestions', () => {
  it('holds across >=100 randomized conversation contexts (template generator)', () => {
    const rand = mulberry32(0x5031_0001); // "P31"

    for (let s = 0; s < SAMPLES; s += 1) {
      const messages = randomConversation(rand);
      const draft = rand() < 0.5 ? pick(rand, WORD_BANK) : undefined;

      const suggestions = templateSuggestions({
        conversationId: `c_${s}`,
        messages,
        draft,
      });

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeLessThanOrEqual(3);
    }
  });

  it('holds across >=100 randomized contexts via the agent fallback path', async () => {
    const rand = mulberry32(0x5031_0002);
    const agent = new QuantAIAgent(); // no AIEngine → deterministic templates

    for (let s = 0; s < SAMPLES; s += 1) {
      const messages = randomConversation(rand);
      const draft = rand() < 0.5 ? pick(rand, WORD_BANK) : undefined;

      const res = await agent.suggestions({ conversationId: `c_${s}`, messages, draft }, 'user1');

      expect(res.suggestions.length).toBeLessThanOrEqual(3);
    }
  });
});

// ----------------------------------------------------------------------------
// Feature: quantchat-mega-upgrade, Property 33: AI-generated content always labeled
// **Validates: Requirements 11.8**
// ----------------------------------------------------------------------------
describe('Property 33: every AI-agent-produced message is flagged isAIGenerated=true', () => {
  it('holds across >=100 randomized auto-reply + content-generation inputs', async () => {
    const rand = mulberry32(0x5033_0001); // "P33"
    const agent = new QuantAIAgent(); // no AIEngine → deterministic fallback

    for (let s = 0; s < SAMPLES; s += 1) {
      const context = randomConversation(rand);

      // --- auto-reply (12.1) ---
      // incomingMessage must be non-empty (schema min(1)); guarantee a fallback.
      const incomingMessage = pick(rand, WORD_BANK) || 'hello there';
      const reply = await agent.autoReply(
        { conversationId: `c_${s}`, incomingMessage, context },
        'user1',
      );
      expect(reply.isAIGenerated).toBe(true);
      expect(reply.content.length).toBeGreaterThan(0);

      // --- content creation (12.7) ---
      const type: ContentType = pick(rand, CONTENT_TYPES);
      const contentContext = pick(rand, WORD_BANK) || 'a sunset over the mountains';
      const count = randInt(rand, 1, 5);
      const content = await agent.generateContent(
        { type, context: contentContext, count },
        'user1',
      );
      expect(content.isAIGenerated).toBe(true);
      expect(content.suggestions.length).toBeGreaterThan(0);
      expect(content.suggestions.length).toBeLessThanOrEqual(count);
    }
  });
});

// ----------------------------------------------------------------------------
// Feature: quantchat-mega-upgrade, Property 32: Scheduled message delivery within tolerance
// **Validates: Requirements 11.4**
//
// Simulates the ScheduledMessageWorker with an injected clock: schedule a
// message at a random target time T, then advance the clock in 30s ticks
// (the worker's real poll cadence). The first tick >= T delivers it; with a
// 30s cadence that tick is guaranteed to land within [T, T+60s].
// ----------------------------------------------------------------------------

interface Row extends ScheduledMessageRecord {
  status: 'PENDING' | 'SENT' | 'CANCELLED';
}

// Minimal in-memory Prisma double covering only what the worker touches.
function makeFakePrisma(rows: Row[]) {
  const tx = {
    message: {
      create: async (args: { data: unknown }) => ({ id: 'm', ...(args.data as object) }),
    },
    conversation: { update: async () => ({}) },
    scheduledMessage: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: Row['status'] };
      }) => {
        const row = rows.find((r) => r.id === where.id);
        if (row) row.status = data.status;
        return row;
      },
    },
  };
  return {
    scheduledMessage: {
      findMany: async ({ where }: { where: { status: string; scheduledFor: { lte: Date } } }) =>
        rows.filter((r) => r.status === where.status && r.scheduledFor <= where.scheduledFor.lte),
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
}

describe('Property 32: scheduled delivery occurs within [T, T+60s] under 30s polling', () => {
  it('sanity: poll cadence is strictly tighter than the delivery tolerance', () => {
    expect(SCHEDULED_POLL_INTERVAL_MS).toBeLessThan(SCHEDULED_DELIVERY_TOLERANCE_MS);
  });

  it('holds across >=100 randomized target times', async () => {
    const rand = mulberry32(0x5032_0001); // "P32"
    const baseEpoch = Date.parse('2025-01-01T00:00:00Z');

    for (let s = 0; s < SAMPLES; s += 1) {
      // Random target offset T (ms) from base. Use sub-interval resolution so T
      // frequently falls *between* ticks (the interesting/worst case).
      const targetOffsetMs = randInt(rand, 0, 3_600_000); // within the next hour
      const T = baseEpoch + targetOffsetMs;

      const rows: Row[] = [
        {
          id: `s_${s}`,
          userId: 'u1',
          conversationId: 'c1',
          content: `scheduled ${s}`,
          scheduledFor: new Date(T),
          status: 'PENDING',
        },
      ];

      let deliveredAt: number | null = null;
      const prisma = makeFakePrisma(rows);
      const worker = new ScheduledMessageWorker(prisma as never, {
        onDelivered: () => {
          // The tick currently executing is the delivery time (set below).
        },
      });

      // Advance the clock in 30s ticks starting at baseEpoch (a tick boundary at
      // or before any possible T), until the message is delivered.
      const maxTicks = Math.ceil(targetOffsetMs / SCHEDULED_POLL_INTERVAL_MS) + 5;
      for (let k = 0; k <= maxTicks; k += 1) {
        const tickTime = baseEpoch + k * SCHEDULED_POLL_INTERVAL_MS;
        const count = await worker.tick(new Date(tickTime));
        if (count > 0) {
          deliveredAt = tickTime;
          break;
        }
      }

      // Delivery must have happened.
      expect(deliveredAt).not.toBeNull();
      const delivery = deliveredAt!;

      // Lower bound: never delivered before the target time T.
      expect(delivery).toBeGreaterThanOrEqual(T);

      // Upper bound: delivered within the 60s tolerance window.
      expect(delivery - T).toBeLessThanOrEqual(SCHEDULED_DELIVERY_TOLERANCE_MS);

      // Row was actually marked SENT (idempotent terminal state).
      expect(rows[0]!.status).toBe('SENT');
    }
  });
});
