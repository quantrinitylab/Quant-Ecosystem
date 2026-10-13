// ===========================================================================
// QC-F-268 — polls membership/authorization regression tests
// ===========================================================================
//
// Polls were the last conversation-scoped surface with NO membership
// check (the BOLA family: themes QC-F-017, ephemeral QC-F-038, schedule
// QC-F-095, pin/react/consumeSnap in MessageService are all gated):
//   (a) POST /polls handed the body's chatId to PollService unchecked —
//       any logged-in user could create a poll in any conversation, or
//       in one that does not exist at all;
//   (b) POST /polls/:pollId/vote never checked membership — vote
//       stuffing (incl. single-choice vote changes) on anyone's polls;
//   (c) GET /polls/:pollId/results returned the question + every
//       option's voter userIds to any logged-in user;
//   (d) poll ids were `poll_${Date.now()}_${5-char Math.random}` —
//       guessable in practice, which made (b)/(c) enumerable.
// QC-F-018 (identity forgery) is a different axis and stays pinned by its
// own suite; this suite pins AUTHORIZATION.
//
// Fix (brief: specialist-qc-f-268.md): a ThemeService-shaped
// `requireMembership` inside PollService (active row, leftAt: null →
// 403 NOT_A_MEMBER; nonexistent conversation answers exactly like a
// non-member — no existence oracle; fail-closed without Prisma), the
// results route passes the caller's id through, create/vote bodies are
// zod-bounded (pinned order: zod 400 → auth 401 → membership 403), and
// new ids are `poll_${randomUUID()}`.
//
// Harness: the real pollsRoutes + real PollService on a bare Fastify
// instance (F-061/F-095 pattern — one app, caller switched through the
// authUserId closure, real server-core errorHandlerPlugin). The
// membership fake HONOURS the query's leftAt filter: FORMER has a row
// with leftAt set, so a gate that forgot `leftAt: null` would wrongly
// admit them and fail these tests. Identities are stable module-level
// constants.
//
// Negative control (verified by the builder): against the pre-fix
// poll.service.ts / polls.ts, the Slice 1 gate cases (1–6, 9) and the
// Slice 2 cases (11–12) FAIL; the preservation/order pins (7, 8, 10)
// pass on both.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import pollsRoutes from '../routes/polls';
import { PollService } from '../services/poll.service';

const CHAT = 'chat_1';
const MEMBER = 'user_member';
const MEMBER2 = 'user_member2';
const OUTSIDER = 'user_outsider';
const FORMER = 'user_former';

/** Membership rows for CHAT: two active members + one former member. */
const MEMBERSHIP_ROWS: Array<{ conversationId: string; userId: string; leftAt: Date | null }> = [
  { conversationId: CHAT, userId: MEMBER, leftAt: null },
  { conversationId: CHAT, userId: MEMBER2, leftAt: null },
  { conversationId: CHAT, userId: FORMER, leftAt: new Date('2026-10-01T00:00:00Z') },
];

function makeFakePrisma() {
  return {
    conversationMember: {
      async findFirst({ where }: any) {
        const row = MEMBERSHIP_ROWS.find(
          (r) => r.conversationId === where.conversationId && r.userId === where.userId,
        );
        if (!row) return null;
        // Honour the query's leftAt filter like a real delegate: an
        // explicit `leftAt: null` matches only active rows.
        if (where.leftAt !== undefined && row.leftAt !== where.leftAt) return null;
        return { ...row };
      },
    },
  };
}

function pollStoreSize(): number {
  return (PollService as unknown as { memoryStore: Map<string, unknown> }).memoryStore.size;
}

describe('QC-F-268 polls membership authorization', () => {
  let app: FastifyInstance;
  let authUserId: string | null;

  beforeEach(async () => {
    authUserId = MEMBER;
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      makeFakePrisma(),
    );
    app.addHook('preHandler', async (request) => {
      if (authUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
      }
    });
    await app.register(pollsRoutes, { prefix: '/polls' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
    authUserId = userId;
    try {
      return await fn();
    } finally {
      authUserId = MEMBER;
    }
  }

  function inject(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
    return app.inject(payload === undefined ? { method, url } : { method, url, payload });
  }

  async function createPollAsMember(question = 'Ship it?'): Promise<string> {
    const res = await inject('POST', '/polls', {
      chatId: CHAT,
      question,
      options: ['Yes', 'No'],
    });
    expect(res.statusCode).toBe(201);
    return res.json().data.id as string;
  }

  // --- Slice 1: membership gates -------------------------------------------

  it('1. non-member create → 403 NOT_A_MEMBER and no poll is created', async () => {
    const before = pollStoreSize();
    const res = await as(OUTSIDER, () =>
      inject('POST', '/polls', { chatId: CHAT, question: 'Stuffed?', options: ['A', 'B'] }),
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(pollStoreSize()).toBe(before);
  });

  it('2. nonexistent-chat create answers EXACTLY like non-member create (no existence oracle)', async () => {
    const outsider = await as(OUTSIDER, () =>
      inject('POST', '/polls', { chatId: CHAT, question: 'Q?', options: ['A', 'B'] }),
    );
    const ghost = await inject('POST', '/polls', {
      chatId: 'chat_jo_hai_hi_nahi',
      question: 'Q?',
      options: ['A', 'B'],
    });
    expect(outsider.statusCode).toBe(403);
    expect(ghost.statusCode).toBe(403);
    expect(ghost.json().error).toEqual(outsider.json().error);
  });

  it('3. former member (leftAt set) create → 403 NOT_A_MEMBER (leftAt:null filter pin)', async () => {
    const res = await as(FORMER, () =>
      inject('POST', '/polls', { chatId: CHAT, question: 'Q?', options: ['A', 'B'] }),
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
  });

  it('4. non-member vote → 403 NOT_A_MEMBER and the tally is unchanged', async () => {
    const pollId = await createPollAsMember();
    const vote = await inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 });
    expect(vote.statusCode).toBe(200);

    const stuffed = await as(OUTSIDER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(stuffed.statusCode).toBe(403);
    expect(stuffed.json().error.code).toBe('NOT_A_MEMBER');

    const results = await inject('GET', `/polls/${pollId}/results`);
    expect(results.statusCode).toBe(200);
    expect(results.json().data.totalVotes).toBe(1);
    expect(results.json().data.options[1].votes).toBe(0);
  });

  it('5. non-member results → 403 with no question/options/voters leak', async () => {
    const pollId = await createPollAsMember('Secret question?');
    const res = await as(OUTSIDER, () => inject('GET', `/polls/${pollId}/results`));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(res.json().data).toBeUndefined();
    expect(res.body).not.toContain('Secret question?');
  });

  it('6. former member vote and results → 403 NOT_A_MEMBER', async () => {
    const pollId = await createPollAsMember();
    const vote = await as(FORMER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }),
    );
    expect(vote.statusCode).toBe(403);
    expect(vote.json().error.code).toBe('NOT_A_MEMBER');
    const results = await as(FORMER, () => inject('GET', `/polls/${pollId}/results`));
    expect(results.statusCode).toBe(403);
    expect(results.json().error.code).toBe('NOT_A_MEMBER');
  });

  it('7. nonexistent poll → 404 POLL_NOT_FOUND before the gate, for members and non-members alike', async () => {
    const memberVote = await inject('POST', '/polls/poll_jo_nahi_hai/vote', { optionIndex: 0 });
    expect(memberVote.statusCode).toBe(404);
    expect(memberVote.json().error.code).toBe('POLL_NOT_FOUND');

    const memberResults = await inject('GET', '/polls/poll_jo_nahi_hai/results');
    expect(memberResults.statusCode).toBe(404);
    expect(memberResults.json().error.code).toBe('POLL_NOT_FOUND');

    const outsiderVote = await as(OUTSIDER, () =>
      inject('POST', '/polls/poll_jo_nahi_hai/vote', { optionIndex: 0 }),
    );
    expect(outsiderVote.statusCode).toBe(404);
    expect(outsiderVote.json().error.code).toBe('POLL_NOT_FOUND');
  });

  it('8. member flow preserved: create/vote/results + single-choice vote change', async () => {
    const created = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Best stack?',
      options: ['TypeScript', 'Go'],
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.creatorId).toBe(MEMBER);
    const pollId = created.json().data.id as string;

    const vote = await as(MEMBER2, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }),
    );
    expect(vote.statusCode).toBe(200);

    const results = await as(MEMBER2, () => inject('GET', `/polls/${pollId}/results`));
    expect(results.statusCode).toBe(200);
    const data = results.json().data;
    expect(data.question).toBe('Best stack?');
    expect(data.totalVotes).toBe(1);
    expect(data.options[0].votes).toBe(1);
    expect(data.options[0].percentage).toBe(100);
    expect(data.options[0].voters).toEqual([MEMBER2]);

    // Single-choice vote change: tally stays 1, the count moves.
    const change = await as(MEMBER2, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(change.statusCode).toBe(200);
    const after = await inject('GET', `/polls/${pollId}/results`);
    expect(after.json().data.totalVotes).toBe(1);
    expect(after.json().data.options[0].votes).toBe(0);
    expect(after.json().data.options[1].votes).toBe(1);
  });

  it('9. vote response carries the voter roster — and only ever reaches a member', async () => {
    const pollId = await createPollAsMember();
    const vote = await as(MEMBER2, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(vote.statusCode).toBe(200);
    const votes = vote.json().data.votes as Array<{ userId: string; optionIndex: number }>;
    expect(votes).toHaveLength(1);
    expect(votes[0].userId).toBe(MEMBER2);
    expect(votes[0].optionIndex).toBe(1);

    const outsiderVote = await as(OUTSIDER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(outsiderVote.statusCode).toBe(403);
    expect(outsiderVote.json().data).toBeUndefined();
  });

  it('10. unauthenticated create/vote/results → 401', async () => {
    const pollId = await createPollAsMember();
    const create = await as(null, () =>
      inject('POST', '/polls', { chatId: CHAT, question: 'Q?', options: ['A', 'B'] }),
    );
    expect(create.statusCode).toBe(401);
    const vote = await as(null, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }),
    );
    expect(vote.statusCode).toBe(401);
    const results = await as(null, () => inject('GET', `/polls/${pollId}/results`));
    expect(results.statusCode).toBe(401);
  });

  it('service fails closed without a Prisma client (membership can never be assumed)', async () => {
    const bare = new PollService();
    await expect(
      bare.createPoll(CHAT, MEMBER, { question: 'Q?', options: ['A', 'B'] }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_A_MEMBER' });
  });

  // --- Slice 2: validation + unguessable ids --------------------------------

  it('11a. invalid create bodies → 400 VALIDATION_ERROR', async () => {
    const badBodies: Array<Record<string, unknown>> = [
      { question: 'Q?', options: ['A', 'B'] }, // chatId missing
      { chatId: '', question: 'Q?', options: ['A', 'B'] }, // chatId empty
      { chatId: CHAT, question: '', options: ['A', 'B'] }, // question empty
      { chatId: CHAT, question: '   ', options: ['A', 'B'] }, // question spaces only
      { chatId: CHAT, question: 'x'.repeat(501), options: ['A', 'B'] }, // question too long
      { chatId: CHAT, question: 'Q?', options: ['Only'] }, // fewer than 2 options
      {
        chatId: CHAT,
        question: 'Q?',
        options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
      }, // more than 10 options
      { chatId: CHAT, question: 'Q?', options: ['A', ''] }, // empty option
      { chatId: CHAT, question: 'Q?', options: ['A', 'y'.repeat(101)] }, // option too long
    ];
    for (const payload of badBodies) {
      const res = await inject('POST', '/polls', payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('11b. invalid vote bodies → 400 VALIDATION_ERROR', async () => {
    const pollId = await createPollAsMember();
    const badVotes: Array<Record<string, unknown>> = [
      {}, // optionIndex missing
      { optionIndex: -1 },
      { optionIndex: 1.5 },
      { optionIndex: '0' },
    ];
    for (const payload of badVotes) {
      const res = await inject('POST', `/polls/${pollId}/vote`, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('11c. pinned order: zod 400 fires before the membership gate (invalid body from an outsider → 400, valid → 403)', async () => {
    const invalid = await as(OUTSIDER, () =>
      inject('POST', '/polls', { chatId: CHAT, question: '', options: ['A', 'B'] }),
    );
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');

    const valid = await as(OUTSIDER, () =>
      inject('POST', '/polls', { chatId: CHAT, question: 'Q?', options: ['A', 'B'] }),
    );
    expect(valid.statusCode).toBe(403);
    expect(valid.json().error.code).toBe('NOT_A_MEMBER');
  });

  it('12. new poll ids are poll_<uuid> and unique', async () => {
    const a = await createPollAsMember('One?');
    const b = await createPollAsMember('Two?');
    const uuidShape = /^poll_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(a).toMatch(uuidShape);
    expect(b).toMatch(uuidShape);
    expect(a).not.toBe(b);
  });
});
