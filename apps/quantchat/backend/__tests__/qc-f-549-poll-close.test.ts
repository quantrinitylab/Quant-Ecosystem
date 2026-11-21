// ===========================================================================
// QC-F-549 — poll close / expiry regression tests
// ===========================================================================
//
// Polls never closed: PollRecord had no closing field, there was no
// close endpoint, and votePoll never checked a closed state — a poll
// stayed votable forever and its tally never became final. QC-F-335's
// quiz reveal deliberately had no "reveal when the poll closes" branch
// because no close mechanism existed.
//
// Fix (brief: specialist-qc-f-549-buildprep.md, READY-with-corrections):
// PollRecord gains `closedAt` (explicit creator close) + optional
// creator-declared `closesAt` (never a default); POST /polls/:pollId/close
// is creator-only behind the QC-F-268 membership gate (pinned order
// 404 → NOT_A_MEMBER → NOT_POLL_CREATOR → POLL_ALREADY_CLOSED);
// votePoll rejects closed polls with 409 POLL_CLOSED after membership
// and before the option range; serialize/results always carry
// `isClosed` + the real `closedAt` (the declared `closesAt` instant for
// expiry closes); a closed quiz poll reveals its answer to every member.
// No migration — chat polls live in the in-memory store (QC-F-071 owns
// persistence); no web/Flutter files — there is no live poll card.
//
// Harness: the real pollsRoutes + real PollService on a bare Fastify
// instance — the QC-F-268 / QC-F-335 pattern verbatim (stable
// module-level identities, membership fake honouring the leftAt
// filter, real server-core errorHandlerPlugin). Separate file on
// purpose: 268 pins the gate, 335 pins modes, 549 pins the lifecycle;
// no finding's negative control may hide behind another's.
// Time strategy (band): expiry tests use
// vi.useFakeTimers({ shouldAdvanceTime: true }) + vi.setSystemTime —
// no setTimeout sleeps; every other test runs on the real clock.
//
// Negative control (verified by the builder): against the pre-549
// service/routes, ALL 14 tests FAIL for the real reasons (close route
// 404, no isClosed/closedAt/closesAt in any shape, votes succeeding on
// closed/expired polls, quiz answer never revealed on close, past
// closesAt silently stripped by the old schema). T549-14 is the
// preservation control on the FIXED code — its flow assertions are the
// pre-549 flow verbatim; on old code it fails only on the new
// always-present honest-state fields (isClosed/closedAt), which is
// exactly the shape this finding adds.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('QC-F-549 poll close / expiry', () => {
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
    vi.useRealTimers();
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

  async function createStandard(extra: Record<string, unknown> = {}): Promise<any> {
    const res = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Ship it?',
      options: ['Yes', 'No', 'Later'],
      ...extra,
    });
    expect(res.statusCode).toBe(201);
    return res.json().data;
  }

  async function createQuiz(extra: Record<string, unknown> = {}): Promise<any> {
    const res = await inject('POST', '/polls', { ...QUIZ_BODY, ...extra });
    expect(res.statusCode).toBe(201);
    return res.json().data;
  }

  // --- Close: core behaviour ----------------------------------------------

  it('T549-01 creator closes an open poll → 200 with real isClosed/closedAt; tally preserved', async () => {
    const data = await createStandard();
    expect(data.isClosed).toBe(false);
    expect(data.closedAt).toBeNull();
    const pollId = data.id as string;
    await as(VOTER, () => inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }));

    const before = Date.now();
    const res = await inject('POST', `/polls/${pollId}/close`);
    const after = Date.now();
    expect(res.statusCode).toBe(200);
    const closed = res.json().data;
    expect(closed.isClosed).toBe(true);
    const closedAtMs = new Date(closed.closedAt).getTime();
    expect(closedAtMs).toBeGreaterThanOrEqual(before - 1000);
    expect(closedAtMs).toBeLessThanOrEqual(after + 1000);

    const results = await inject('GET', `/polls/${pollId}/results`);
    expect(results.statusCode).toBe(200);
    expect(results.json().data.isClosed).toBe(true);
    expect(results.json().data.closedAt).toBe(closed.closedAt);
    expect(results.json().data.totalVotes).toBe(1);
  });

  it('T549-02 vote after close → 409 POLL_CLOSED (new vote AND vote change); tally unchanged', async () => {
    const data = await createStandard();
    const pollId = data.id as string;
    await as(VOTER, () => inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }));
    await inject('POST', `/polls/${pollId}/close`);

    const newVote = await as(OTHER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(newVote.statusCode).toBe(409);
    expect(newVote.json().error.code).toBe('POLL_CLOSED');

    const change = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 2 }),
    );
    expect(change.statusCode).toBe(409);
    expect(change.json().error.code).toBe('POLL_CLOSED');

    const results = await inject('GET', `/polls/${pollId}/results`);
    expect(results.json().data.totalVotes).toBe(1);
    expect(results.json().data.options[0].votes).toBe(1);
    expect(results.json().data.options[1].votes).toBe(0);
    expect(results.json().data.options[2].votes).toBe(0);
  });

  it('T549-03 non-creator member close → 403 NOT_POLL_CREATOR and poll stays open', async () => {
    const data = await createStandard();
    const pollId = data.id as string;
    const res = await as(VOTER, () => inject('POST', `/polls/${pollId}/close`));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_POLL_CREATOR');

    // Still open: a real vote succeeds afterwards.
    const vote = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(vote.statusCode).toBe(200);
    expect(vote.json().data.isClosed).toBe(false);
  });

  it('T549-04 membership before creator/closed checks: outsider & former close → NOT_A_MEMBER; former vote on closed poll → NOT_A_MEMBER', async () => {
    const data = await createStandard();
    const pollId = data.id as string;

    const outsiderClose = await as(OUTSIDER, () => inject('POST', `/polls/${pollId}/close`));
    expect(outsiderClose.statusCode).toBe(403);
    expect(outsiderClose.json().error.code).toBe('NOT_A_MEMBER');

    const formerClose = await as(FORMER, () => inject('POST', `/polls/${pollId}/close`));
    expect(formerClose.statusCode).toBe(403);
    expect(formerClose.json().error.code).toBe('NOT_A_MEMBER');

    await inject('POST', `/polls/${pollId}/close`);
    const formerVote = await as(FORMER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }),
    );
    expect(formerVote.statusCode).toBe(403);
    expect(formerVote.json().error.code).toBe('NOT_A_MEMBER');
  });

  it('T549-05 unauthenticated close → 401; nonexistent poll close → 404 POLL_NOT_FOUND for member and outsider alike', async () => {
    const data = await createStandard();
    const noAuth = await as(null, () => inject('POST', `/polls/${data.id}/close`));
    expect(noAuth.statusCode).toBe(401);

    const memberMissing = await inject('POST', '/polls/poll_jo_nahi_hai/close');
    expect(memberMissing.statusCode).toBe(404);
    expect(memberMissing.json().error.code).toBe('POLL_NOT_FOUND');

    const outsiderMissing = await as(OUTSIDER, () =>
      inject('POST', '/polls/poll_jo_nahi_hai/close'),
    );
    expect(outsiderMissing.statusCode).toBe(404);
    expect(outsiderMissing.json().error.code).toBe('POLL_NOT_FOUND');
  });

  it('T549-06 second close → 409 POLL_ALREADY_CLOSED and closedAt is never rewritten', async () => {
    const data = await createStandard();
    const pollId = data.id as string;
    const first = await inject('POST', `/polls/${pollId}/close`);
    expect(first.statusCode).toBe(200);
    const firstClosedAt = first.json().data.closedAt;

    const second = await inject('POST', `/polls/${pollId}/close`);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('POLL_ALREADY_CLOSED');

    const results = await inject('GET', `/polls/${pollId}/results`);
    expect(results.json().data.closedAt).toBe(firstClosedAt);
  });

  it('T549-07 creator who is no longer a member close → 403 NOT_A_MEMBER, poll stays open', async () => {
    const data = await createStandard();
    const pollId = data.id as string;
    const row = MEMBERSHIP_ROWS.find((r) => r.userId === CREATOR && r.conversationId === CHAT)!;
    row.leftAt = new Date('2026-10-20T00:00:00Z');
    try {
      const res = await inject('POST', `/polls/${pollId}/close`);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('NOT_A_MEMBER');
    } finally {
      row.leftAt = null;
    }
    const vote = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }),
    );
    expect(vote.statusCode).toBe(200);
    expect(vote.json().data.isClosed).toBe(false);
  });

  // --- Closed quiz reveal (QC-F-335 deferred branch) ------------------------

  it('T549-08 closed quiz reveals answer to a member who never voted; yourCorrect stays absent', async () => {
    const data = await createQuiz();
    const pollId = data.id as string;

    const before = await as(OTHER, () => inject('GET', `/polls/${pollId}/results`));
    expect(before.statusCode).toBe(200);
    expect('correctOptionIndex' in before.json().data).toBe(false);
    expect('explanation' in before.json().data).toBe(false);

    await inject('POST', `/polls/${pollId}/close`);

    const afterRes = await as(OTHER, () => inject('GET', `/polls/${pollId}/results`));
    expect(afterRes.statusCode).toBe(200);
    expect(afterRes.json().data.correctOptionIndex).toBe(0);
    expect(afterRes.json().data.explanation).toBe('Paris is the capital of France.');
    expect(afterRes.json().data.yourVote).toEqual([]);
    expect('yourCorrect' in afterRes.json().data).toBe(false);
    expect(afterRes.json().data.isClosed).toBe(true);
  });

  it('T549-09 closed quiz voter keeps reveal + yourCorrect; closed standard poll never gains quiz fields', async () => {
    const quiz = await createQuiz();
    await as(VOTER, () => inject('POST', `/polls/${quiz.id}/vote`, { optionIndex: 0 }));
    await inject('POST', `/polls/${quiz.id}/close`);
    const voterResults = await as(VOTER, () => inject('GET', `/polls/${quiz.id}/results`));
    expect(voterResults.json().data.correctOptionIndex).toBe(0);
    expect(voterResults.json().data.yourCorrect).toBe(true);

    const standard = await createStandard();
    await inject('POST', `/polls/${standard.id}/close`);
    const stdResults = await inject('GET', `/polls/${standard.id}/results`);
    expect(stdResults.json().data.isClosed).toBe(true);
    expect('correctOptionIndex' in stdResults.json().data).toBe(false);
    expect('explanation' in stdResults.json().data).toBe(false);
    expect('yourCorrect' in stdResults.json().data).toBe(false);
  });

  it('T549-10 vote order on closed poll: outsider → NOT_A_MEMBER, member out-of-range → POLL_CLOSED, open poll out-of-range → INVALID_OPTION (control)', async () => {
    const data = await createStandard();
    const pollId = data.id as string;
    await inject('POST', `/polls/${pollId}/close`);

    const outsiderVote = await as(OUTSIDER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }),
    );
    expect(outsiderVote.statusCode).toBe(403);
    expect(outsiderVote.json().error.code).toBe('NOT_A_MEMBER');

    const closedRange = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 99 }),
    );
    expect(closedRange.statusCode).toBe(409);
    expect(closedRange.json().error.code).toBe('POLL_CLOSED');

    const open = await createStandard();
    const openRange = await as(VOTER, () =>
      inject('POST', `/polls/${open.id}/vote`, { optionIndex: 99 }),
    );
    expect(openRange.statusCode).toBe(400);
    expect(openRange.json().error.code).toBe('INVALID_OPTION');
  });

  // --- Declared expiry ------------------------------------------------------

  it('T549-11 declared closesAt expiry closes lazily: vote → POLL_CLOSED, closedAt == declared closesAt, explicit close → ALREADY_CLOSED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const base = new Date('2031-06-01T00:00:00.000Z');
      vi.setSystemTime(base);
      const closesAt = new Date(base.getTime() + 60_000).toISOString();
      const data = await createStandard({ closesAt });
      expect(data.closesAt).toBe(closesAt);
      expect(data.isClosed).toBe(false);
      expect(data.closedAt).toBeNull();

      vi.setSystemTime(new Date(base.getTime() + 61_000));
      const vote = await as(VOTER, () =>
        inject('POST', `/polls/${data.id}/vote`, { optionIndex: 0 }),
      );
      expect(vote.statusCode).toBe(409);
      expect(vote.json().error.code).toBe('POLL_CLOSED');

      const results = await inject('GET', `/polls/${data.id}/results`);
      expect(results.json().data.isClosed).toBe(true);
      expect(results.json().data.closedAt).toBe(closesAt);

      const close = await inject('POST', `/polls/${data.id}/close`);
      expect(close.statusCode).toBe(409);
      expect(close.json().error.code).toBe('POLL_ALREADY_CLOSED');
    } finally {
      vi.useRealTimers();
    }
  });

  it('T549-12 closesAt validation is loud: past → 400 INVALID_POLL + nothing stored; garbage → 400 VALIDATION_ERROR; absent → no key and poll never auto-closes', async () => {
    const before = pollStoreSize();
    const past = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Past expiry?',
      options: ['A', 'B'],
      closesAt: '2020-01-01T00:00:00.000Z',
    });
    expect(past.statusCode).toBe(400);
    expect(past.json().error.code).toBe('INVALID_POLL');
    expect(pollStoreSize()).toBe(before);

    const garbage = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Garbage expiry?',
      options: ['A', 'B'],
      closesAt: 'not-a-date',
    });
    expect(garbage.statusCode).toBe(400);
    expect(garbage.json().error.code).toBe('VALIDATION_ERROR');
    expect(pollStoreSize()).toBe(before);

    // No declared expiry: no closesAt key anywhere, and time passing
    // alone never closes the poll (fake clock, no sleeps).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const base = new Date('2031-06-01T00:00:00.000Z');
      vi.setSystemTime(base);
      const data = await createStandard();
      expect('closesAt' in data).toBe(false);
      vi.setSystemTime(new Date(base.getTime() + 7 * 24 * 3600_000));
      const vote = await as(VOTER, () =>
        inject('POST', `/polls/${data.id}/vote`, { optionIndex: 0 }),
      );
      expect(vote.statusCode).toBe(200);
      expect(vote.json().data.isClosed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('T549-13 expiry-closed quiz reveals to non-voter; anonymous closed poll still exposes no roster', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const base = new Date('2031-06-01T00:00:00.000Z');
      vi.setSystemTime(base);
      const closesAt = new Date(base.getTime() + 60_000).toISOString();
      const quiz = await createQuiz({ closesAt, isAnonymous: true });
      await as(VOTER, () => inject('POST', `/polls/${quiz.id}/vote`, { optionIndex: 1 }));

      vi.setSystemTime(new Date(base.getTime() + 61_000));
      const results = await as(OTHER, () => inject('GET', `/polls/${quiz.id}/results`));
      expect(results.statusCode).toBe(200);
      expect(results.json().data.isClosed).toBe(true);
      expect(results.json().data.correctOptionIndex).toBe(0);
      expect(results.json().data.explanation).toBe('Paris is the capital of France.');
      // Anonymous exposure contract survives closing: no voters roster.
      for (const opt of results.json().data.options) {
        expect('voters' in opt).toBe(false);
      }

      const anon = await createStandard({ isAnonymous: true });
      await inject('POST', `/polls/${anon.id}/close`);
      const anonResults = await inject('GET', `/polls/${anon.id}/results`);
      expect(anonResults.json().data.isClosed).toBe(true);
      for (const opt of anonResults.json().data.options) {
        expect('voters' in opt).toBe(false);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  // --- Control ---------------------------------------------------------------

  it('T549-14 control: open poll flow unchanged — create/vote/change/results with honest open state', async () => {
    const created = await inject('POST', '/polls', {
      chatId: CHAT,
      question: 'Best stack?',
      options: ['TypeScript', 'Go'],
    });
    expect(created.statusCode).toBe(201);
    const data = created.json().data;
    expect(data.isClosed).toBe(false);
    expect(data.closedAt).toBeNull();
    expect('closesAt' in data).toBe(false);
    const pollId = data.id as string;

    const vote = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 0 }),
    );
    expect(vote.statusCode).toBe(200);
    expect(vote.json().data.yourVote).toEqual([0]);

    const change = await as(VOTER, () =>
      inject('POST', `/polls/${pollId}/vote`, { optionIndex: 1 }),
    );
    expect(change.statusCode).toBe(200);
    expect(change.json().data.yourVote).toEqual([1]);

    const results = await inject('GET', `/polls/${pollId}/results`);
    expect(results.statusCode).toBe(200);
    expect(results.json().data.totalVotes).toBe(1);
    expect(results.json().data.options[1].votes).toBe(1);
    expect(results.json().data.isClosed).toBe(false);
    expect(results.json().data.closedAt).toBeNull();
  });
});
