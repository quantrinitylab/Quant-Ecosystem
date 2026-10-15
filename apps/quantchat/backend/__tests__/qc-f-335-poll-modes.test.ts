// ===========================================================================
// QC-F-335 — poll modes (quiz + anonymous) regression tests
// ===========================================================================
//
// Polls had only the plainest form: PollRecord carried just
// {question, options, allowMultiple}, and anonymous voting was
// STRUCTURALLY impossible — getPollResults handed every member every
// option's `voters: string[]`, and the create/vote responses returned
// the raw record including the full `votes` roster.
//
// Fix (brief: specialist-qc-f-335-buildprep.md, READY-with-corrections):
// two orthogonal axes on the record — `mode: 'standard' | 'quiz'`
// (scoring) and `isAnonymous: boolean` (visibility), both with
// back-compat defaults. Service-level semantic validation rejects
// invalid quiz definitions with 400 INVALID_POLL (quiz requires an
// in-range correctOptionIndex, quiz is single-choice, standard polls
// reject quiz fields — nothing is silently stripped). Anonymous is an
// EXPOSURE contract: identity stays in the stored record (vote
// replace/toggle needs it) but no response — results, create or vote —
// exposes another user's vote; the roster key is omitted entirely.
// Quiz answers are revealed under ONE predicate (creator, or a member
// who has voted) shared by the serializer and getPollResults.
//
// Harness: the real pollsRoutes + real PollService on a bare Fastify
// instance — the QC-F-268 pattern verbatim (stable module-level
// identities, membership fake honouring the leftAt filter, real
// server-core errorHandlerPlugin). This file is separate from the 268
// suite on purpose: 268 pins the membership gate, this pins modes;
// neither finding's negative control may hide behind the other's.
//
// Negative control (verified by the builder): against the pre-335
// service/routes, the original zod schema silently strips the new
// fields and every poll is created standard — Q1–Q7, A1–A4 and C1
// FAIL (14 of 15 tests; Q2 is three `it` blocks), B1 PASSES (control:
// standard shape is byte-identical before and after).
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import pollsRoutes from '../routes/polls';
import { PollService } from '../services/poll.service';

const CHAT = 'chat_1';
const CREATOR = 'user_member';
const VOTER = 'user_member2';
const OTHER = 'user_member3';
const OUTSIDER = 'user_outsider';
const FORMER = 'user_former';

/** Membership rows for CHAT: three active members + one former member. */
const MEMBERSHIP_ROWS: Array<{ conversationId: string; userId: string; leftAt: Date | null }> = [
  { conversationId: CHAT, userId: CREATOR, leftAt: null },
  { conversationId: CHAT, userId: VOTER, leftAt: null },
  { conversationId: CHAT, userId: OTHER, leftAt: null },
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

const QUIZ_BODY = {
  chatId: CHAT,
  question: 'Capital of France?',
  options: ['Paris', 'London', 'Berlin'],
  mode: 'quiz',
  correctOptionIndex: 0,
  explanation: 'Paris is the capital of France.',
} as const;

describe('QC-F-335 poll modes (quiz + anonymous)', () => {
  let app: FastifyInstance;
  let authUserId: string | null;

  beforeEach(async () => {
    authUserId = CREATOR;
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
      authUserId = CREATOR;
    }
  }

  function inject(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
    return app.inject(payload === undefined ? { method, url } : { method, url, payload });
  }

  async function createQuiz(): Promise<string> {
    const res = await inject('POST', '/polls', { ...QUIZ_BODY });
    expect(res.statusCode).toBe(201);
    return res.json().data.id as string;
  }

  async function createAnon(question = 'Anonymous?'): Promise<string> {
    const res = await inject('POST', '/polls', {
      chatId: CHAT,
      question,
      options: ['Alpha', 'Beta', 'Gamma'],
      isAnonymous: true,
    });
    expect(res.statusCode).toBe(201);
    return res.json().data.id as string;
  }

  // --- Quiz: model + validation -------------------------------------------

  it('Q1 quiz poll stores mode, correctOptionIndex and explanation; standard poll defaults are clean', async () => {
    const quiz = await inject('POST', '/polls', { ...QUIZ_BODY });
    expect(quiz.statusCode).toBe(201);
    const qd = quiz.json().data;
    expect(qd.mode).toBe('quiz');
    expect(qd.isAnonymous).toBe(false);
    expect(qd.correctOptionIndex).toBe(0);
    expect(qd.explanation).toBe('Paris is the capital of France.');
    expect(qd.yourVote).toEqual([]);
    expect('yourCorrect' in qd).toBe(false);
    // The stored record itself carries the mode fields.
    const stored = (
      PollService as unknown as { memoryStore: Map<string, Record<string, unknown>> }
    ).memoryStore.get(qd.id);
    expect(stored?.mode).toBe('quiz');
    expect(stored?.correctOptionIndex).toBe(0);

    const standard = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Plain?',
      options: ['Yes', 'No'],
    });
    expect(standard.statusCode).toBe(201);
    const sd = standard.json().data;
    expect(sd.mode).toBe('standard');
    expect(sd.isAnonymous).toBe(false);
    expect('correctOptionIndex' in sd).toBe(false);
    expect('explanation' in sd).toBe(false);
  });

  it('Q2a quiz without correctOptionIndex is rejected 400 INVALID_POLL and nothing is stored', async () => {
    const before = pollStoreSize();
    const res = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Quiz?',
      options: ['A', 'B'],
      mode: 'quiz',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_POLL');
    expect(pollStoreSize()).toBe(before);
  });

  it('Q2b quiz with correctOptionIndex out of range is rejected 400 INVALID_POLL and nothing is stored', async () => {
    const before = pollStoreSize();
    const res = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Quiz?',
      options: ['A', 'B', 'C'],
      mode: 'quiz',
      correctOptionIndex: 5,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_POLL');
    expect(pollStoreSize()).toBe(before);
  });

  it('Q2c standard poll carrying quiz fields is rejected 400 INVALID_POLL and nothing is stored', async () => {
    const before = pollStoreSize();
    const withIndex = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Plain?',
      options: ['A', 'B'],
      correctOptionIndex: 0,
    });
    expect(withIndex.statusCode).toBe(400);
    expect(withIndex.json().error.code).toBe('INVALID_POLL');

    const withExplanation = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Plain?',
      options: ['A', 'B'],
      explanation: 'Because.',
    });
    expect(withExplanation.statusCode).toBe(400);
    expect(withExplanation.json().error.code).toBe('INVALID_POLL');
    expect(pollStoreSize()).toBe(before);
  });

  it('Q3 quiz with allowMultiple is rejected 400 INVALID_POLL', async () => {
    const before = pollStoreSize();
    const res = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Quiz?',
      options: ['A', 'B'],
      mode: 'quiz',
      allowMultiple: true,
      correctOptionIndex: 0,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_POLL');
    expect(pollStoreSize()).toBe(before);
  });

  // --- Quiz: reveal predicate ----------------------------------------------

  it('Q4 quiz results hide the correct answer from a member who has not voted', async () => {
    const pollId = await createQuiz();
    const res = await as(VOTER, () => inject('GET', `/polls/${pollId}/results`));
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    // Being a quiz is public — the ANSWER is what stays hidden.
    expect(data.mode).toBe('quiz');
    expect('correctOptionIndex' in data).toBe(false);
    expect('explanation' in data).toBe(false);
    expect('yourCorrect' in data).toBe(false);
    expect(data.yourVote).toEqual([]);
    expect(res.body).not.toContain('Paris is the capital of France.');
  });

  it('Q5 after voting, quiz results reveal the answer and mark the voter correct or incorrect', async () => {
    const pollId = await createQuiz();

    const correctVote = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }),
    );
    expect(correctVote.statusCode).toBe(200);
    const voterResults = await as(VOTER, () => inject('GET', `/polls/${pollId}/results`));
    const vd = voterResults.json().data;
    expect(vd.correctOptionIndex).toBe(0);
    expect(vd.explanation).toBe('Paris is the capital of France.');
    expect(vd.yourVote).toEqual([0]);
    expect(vd.yourCorrect).toBe(true);

    const wrongVote = await as(OTHER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(wrongVote.statusCode).toBe(200);
    const otherResults = await as(OTHER, () => inject('GET', `/polls/${pollId}/results`));
    const od = otherResults.json().data;
    expect(od.correctOptionIndex).toBe(0);
    expect(od.yourVote).toEqual([1]);
    expect(od.yourCorrect).toBe(false);
  });

  it('Q6 the quiz creator sees the correct answer before any vote', async () => {
    const pollId = await createQuiz();
    const res = await inject('GET', `/polls/${pollId}/results`);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.correctOptionIndex).toBe(0);
    expect(data.explanation).toBe('Paris is the capital of France.');
    // Creator has not voted — no correctness verdict for them.
    expect('yourCorrect' in data).toBe(false);
    expect(data.yourVote).toEqual([]);
  });

  it('Q7 quiz vote response gives the voter immediate correct/incorrect feedback', async () => {
    const pollId = await createQuiz();
    const vote = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 2 }),
    );
    expect(vote.statusCode).toBe(200);
    const data = vote.json().data;
    expect(data.correctOptionIndex).toBe(0);
    expect(data.explanation).toBe('Paris is the capital of France.');
    expect(data.yourVote).toEqual([2]);
    expect(data.yourCorrect).toBe(false);

    // The feedback came from the vote response itself: a member who
    // still has not voted sees no answer on the same poll (Q4 holds).
    const otherResults = await as(OTHER, () => inject('GET', `/polls/${pollId}/results`));
    expect('correctOptionIndex' in otherResults.json().data).toBe(false);
  });

  // --- Anonymous: exposure contract -----------------------------------------

  it('A1 anonymous results expose counts only — no voters key for creator, voter or other member', async () => {
    const pollId = await createAnon();
    await as(VOTER, () => inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }));
    await as(OTHER, () => inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }));
    await inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 });

    for (const caller of [CREATOR, VOTER, OTHER]) {
      const res = await as(caller, () => inject('GET', `/polls/${pollId}/results`));
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.isAnonymous).toBe(true);
      expect(data.totalVotes).toBe(3);
      expect(data.options[0].votes).toBe(2);
      expect(data.options[0].percentage).toBe(66.67);
      expect(data.options[1].votes).toBe(1);
      expect(data.options[1].percentage).toBe(33.33);
      expect(data.options[2].votes).toBe(0);
      for (const option of data.options) {
        expect('voters' in option).toBe(false);
      }
      expect(res.body).not.toContain('"voters"');
    }
  });

  it("A2 anonymous create and vote responses never carry another voter's id", async () => {
    const created = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Anonymous?',
      options: ['Alpha', 'Beta', 'Gamma'],
      isAnonymous: true,
    });
    expect(created.statusCode).toBe(201);
    // No roster key at all on an anonymous create response, and no
    // other member's id anywhere in it. (creatorId is the poll's
    // public authorship — the creator's OWN id in their own response;
    // what must never appear is vote data about anyone.)
    expect('votes' in created.json().data).toBe(false);
    expect(created.body).not.toContain(VOTER);
    expect(created.body).not.toContain(OTHER);
    const pollId = created.json().data.id as string;

    await as(OTHER, () => inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }));
    const vote = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(vote.statusCode).toBe(200);
    expect('votes' in vote.json().data).toBe(false);
    // OTHER already voted on this poll — their id must not leak into
    // VOTER's vote response through any nested field.
    expect(vote.body).not.toContain(OTHER);
    expect(vote.json().data.yourVote).toEqual([1]);
  });

  it('A3 anonymous voter still sees and can change their own vote', async () => {
    const pollId = await createAnon();
    await as(VOTER, () => inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }));
    let results = await as(VOTER, () => inject('GET', `/polls/${pollId}/results`));
    expect(results.json().data.yourVote).toEqual([0]);
    expect(results.json().data.options[0].votes).toBe(1);

    // Single-choice change: identity is retained server-side (that is
    // what makes the replace possible) while staying unexposed.
    await as(VOTER, () => inject('POST', `/polls/${pollId}/vote`, { optionIndex: 2 }));
    results = await as(VOTER, () => inject('GET', `/polls/${pollId}/results`));
    const data = results.json().data;
    expect(data.yourVote).toEqual([2]);
    expect(data.totalVotes).toBe(1);
    expect(data.options[0].votes).toBe(0);
    expect(data.options[2].votes).toBe(1);
  });

  it('A4 anonymous does not bypass the membership gate', async () => {
    const created = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Anonymous?',
      options: ['Alpha', 'Beta'],
      isAnonymous: true,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.isAnonymous).toBe(true);
    const pollId = created.json().data.id as string;

    const results = await as(OUTSIDER, () => inject('GET', `/polls/${pollId}/results`));
    expect(results.statusCode).toBe(403);
    expect(results.json().error.code).toBe('NOT_A_MEMBER');
    expect(results.json().data).toBeUndefined();

    const vote = await as(OUTSIDER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }),
    );
    expect(vote.statusCode).toBe(403);
    expect(vote.json().error.code).toBe('NOT_A_MEMBER');
  });

  // --- Combined + control ----------------------------------------------------

  it('C1 quiz and anonymous combine: reveal after vote, voters never exposed', async () => {
    const created = await inject('POST', '/polls', {
      chatId: CHAT,
      question: '2 + 2 = ?',
      options: ['3', '4', '5'],
      mode: 'quiz',
      isAnonymous: true,
      correctOptionIndex: 1,
      explanation: 'Basic arithmetic.',
    });
    expect(created.statusCode).toBe(201);
    const pollId = created.json().data.id as string;

    const vote = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(vote.statusCode).toBe(200);
    expect('votes' in vote.json().data).toBe(false);
    expect(vote.json().data.yourCorrect).toBe(true);

    const voterResults = await as(VOTER, () => inject('GET', `/polls/${pollId}/results`));
    const vd = voterResults.json().data;
    expect(vd.correctOptionIndex).toBe(1);
    expect(vd.explanation).toBe('Basic arithmetic.');
    expect(vd.yourCorrect).toBe(true);
    for (const option of vd.options) {
      expect('voters' in option).toBe(false);
    }

    const otherResults = await as(OTHER, () => inject('GET', `/polls/${pollId}/results`));
    const od = otherResults.json().data;
    expect('correctOptionIndex' in od).toBe(false);
    for (const option of od.options) {
      expect('voters' in option).toBe(false);
    }
  });

  it('B1 standard polls keep the exact pre-335 shape (268/whoxa control)', async () => {
    const created = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Ship it?',
      options: ['Yes', 'No'],
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.creatorId).toBe(CREATOR);
    const pollId = created.json().data.id as string;

    const vote = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(vote.statusCode).toBe(200);
    // QC-F-268 case 9 pin: the standard vote response carries the roster.
    const votes = vote.json().data.votes as Array<{ userId: string; optionIndex: number }>;
    expect(votes).toHaveLength(1);
    expect(votes[0].userId).toBe(VOTER);
    expect(votes[0].optionIndex).toBe(1);

    const results = await as(VOTER, () => inject('GET', `/polls/${pollId}/results`));
    expect(results.statusCode).toBe(200);
    const data = results.json().data;
    expect(data.question).toBe('Ship it?');
    expect(data.totalVotes).toBe(1);
    expect(data.options[1].votes).toBe(1);
    expect(data.options[1].percentage).toBe(100);
    expect(data.options[1].voters).toEqual([VOTER]);
    expect(data.options[0].voters).toEqual([]);
  });
});
