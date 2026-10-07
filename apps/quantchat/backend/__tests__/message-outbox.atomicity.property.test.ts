// ============================================================================
// Property test — MessageService transactional outbox delivery atomicity
// Spec: quantchat-launch-readiness, Task 11.3
// Design: Correctness Property 3 ("Delivery atomicity"), Component 3
//         ("OutboxService"), Algorithm 2 ("Send message with transactional
//         outbox"). Requirements 7.1, 7.2.
//
//   Property 3 — for any send/induced-failure interleaving:
//     * count(messages) == count(matching MessageOutbox rows) at every commit
//       boundary;
//     * a rolled-back / failed transaction leaves NO outbox row AND no message;
//     * every committed message has exactly ONE matching outbox row carrying the
//       correct recipientIds (active members minus the sender).
//
// Library: fast-check (per the design's Testing Strategy), minimum 100 runs.
// Drives the REAL MessageService + real PrismaOutboxService against an in-memory
// fake Prisma whose `$transaction` rolls back ALL staged writes when the
// callback throws — so atomicity is genuinely exercised, not assumed.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MessageService } from '../services/message.service';
import {
  createFakeMessagePrisma,
  asPrismaClient,
  type SeedConversation,
} from './fake-message-prisma';

// A single planned send: which conversation, who sends, and whether the
// underlying transaction will commit or be forced to roll back.
interface PlannedSend {
  conversationId: string;
  senderId: string;
  content: string;
  /** When true, the conversation row is missing so the tx rolls back. */
  willFail: boolean;
}

// Generates a coherent set of conversations (each with >= 2 active members so
// there is always at least one recipient) plus a sequence of sends drawn from
// those conversations, a fraction of which are induced to fail.
const scenarioArb = fc
  .array(
    fc.record({
      idx: fc.integer({ min: 0, max: 9 }),
      memberCount: fc.integer({ min: 2, max: 5 }),
      // When false the conversation row is absent -> sends to it roll back.
      exists: fc.boolean(),
    }),
    { minLength: 1, maxLength: 6 },
  )
  .chain((convSpecs) => {
    // De-duplicate by idx so each conversation id is unique and coherent.
    const byIdx = new Map<number, { memberCount: number; exists: boolean }>();
    for (const c of convSpecs) {
      if (!byIdx.has(c.idx)) {
        byIdx.set(c.idx, { memberCount: c.memberCount, exists: c.exists });
      }
    }
    const seeds: SeedConversation[] = [];
    const sendChoices: PlannedSend[][] = [];
    for (const [idx, spec] of byIdx.entries()) {
      const conversationId = `conv-${idx}`;
      const memberIds = Array.from({ length: spec.memberCount }, (_, i) => `conv-${idx}-user-${i}`);
      seeds.push({ conversationId, memberIds, exists: spec.exists });
      // Each member may send; willFail is determined by whether the conv exists.
      sendChoices.push(
        memberIds.map((senderId) => ({
          conversationId,
          senderId,
          content: `hello from ${senderId}`,
          willFail: spec.exists === false,
        })),
      );
    }
    const flatChoices = sendChoices.flat();
    return fc
      .array(fc.constantFrom(...flatChoices), { minLength: 1, maxLength: 30 })
      .map((sends) => ({ seeds, sends }));
  });

// Feature: quantchat-launch-readiness, Property 3: Delivery atomicity
// **Validates: Requirements 7.1, 7.2**
describe('Feature: quantchat-launch-readiness, Property 3: Delivery atomicity', () => {
  it('message and matching outbox row commit (or roll back) all-or-nothing across any send interleaving', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ seeds, sends }) => {
        const prisma = createFakeMessagePrisma(seeds);
        const service = new MessageService(asPrismaClient(prisma));

        const activeMembersByConv = new Map<string, string[]>();
        for (const s of seeds) {
          activeMembersByConv.set(s.conversationId, s.memberIds);
        }

        let expectedCommits = 0;

        for (const send of sends) {
          if (send.willFail) {
            // The transaction must throw (conversation.update -> P2025) and roll back.
            await expect(
              service.sendMessage({
                conversationId: send.conversationId,
                senderId: send.senderId,
                content: send.content,
              }),
            ).rejects.toBeTruthy();
          } else {
            const msg = await service.sendMessage({
              conversationId: send.conversationId,
              senderId: send.senderId,
              content: send.content,
            });
            expect(msg).toBeTruthy();
            expectedCommits += 1;
          }

          // ---- Commit-boundary invariant (checked after EVERY send) ----
          // count(messages) == count(matching outbox rows): every persisted
          // message has a 1:1 matching outbox row, and a failed tx added neither.
          const { messages, outbox } = prisma.__state;
          expect(messages.length).toBe(expectedCommits);
          expect(outbox.length).toBe(messages.length);

          // Each committed message has EXACTLY one matching outbox row.
          for (const m of messages) {
            const matching = outbox.filter((o) => o.messageId === m.id);
            expect(matching).toHaveLength(1);

            // The outbox row carries the correct recipientIds: active members
            // of the conversation MINUS the sender (design Algorithm 2).
            const expectedRecipients = (activeMembersByConv.get(m.conversationId) ?? [])
              .filter((u) => u !== m.senderId)
              .sort();
            expect([...matching[0]!.recipientIds].sort()).toEqual(expectedRecipients);
            expect(matching[0]!.conversationId).toBe(m.conversationId);
          }
        }

        // Final global invariant: a matching outbox row for every message, no orphans.
        const { messages, outbox } = prisma.__state;
        expect(outbox.length).toBe(messages.length);
        const messageIds = new Set(messages.map((m) => m.id));
        for (const o of outbox) {
          expect(messageIds.has(o.messageId)).toBe(true);
        }
      }),
      { numRuns: 120 },
    );
  });

  it('a rolled-back send leaves NO message and NO outbox row', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 1, max: 15 }),
        async (memberCount, attempts) => {
          // A conversation whose row is ABSENT (exists: false): members exist so
          // the membership check passes, but conversation.update throws inside
          // the tx, forcing a rollback after message.create has staged a row.
          const memberIds = Array.from({ length: memberCount }, (_, i) => `u-${i}`);
          const prisma = createFakeMessagePrisma([
            { conversationId: 'conv-missing', memberIds, exists: false },
          ]);
          const service = new MessageService(asPrismaClient(prisma));

          for (let i = 0; i < attempts; i += 1) {
            await expect(
              service.sendMessage({
                conversationId: 'conv-missing',
                senderId: memberIds[i % memberIds.length]!,
                content: `attempt ${i}`,
              }),
            ).rejects.toBeTruthy();
          }

          // Despite many attempts, nothing was ever committed — full rollback.
          expect(prisma.__state.messages).toHaveLength(0);
          expect(prisma.__state.outbox).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
