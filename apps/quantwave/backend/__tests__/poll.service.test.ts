import { describe, it, expect, beforeEach } from 'vitest';
import { PollService } from '../services/poll.service';

// A small in-memory prisma double that models the Poll/PollVote tables closely
// enough to exercise the real voting/toggle/integrity logic.
function createMockPrisma(seedPoll?: {
  id: string;
  postId: string;
  question: string;
  options: string[];
  endAt?: Date | null;
  allowMultiple?: boolean;
}) {
  const polls = new Map<string, any>();
  let votes: any[] = [];
  let voteSeq = 0;

  if (seedPoll) {
    polls.set(seedPoll.postId, {
      id: seedPoll.id,
      postId: seedPoll.postId,
      question: seedPoll.question,
      options: seedPoll.options,
      endAt: seedPoll.endAt ?? null,
      allowMultiple: seedPoll.allowMultiple ?? false,
      voterCount: 0,
    });
  }

  return {
    _state: {
      get votes() {
        return votes;
      },
      polls,
    },
    poll: {
      findUnique: async ({ where }: any) => {
        if (where.postId) return polls.get(where.postId) ?? null;
        for (const p of polls.values()) if (p.id === where.id) return p;
        return null;
      },
      create: async ({ data }: any) => {
        const row = { id: `poll_${polls.size + 1}`, voterCount: 0, ...data };
        polls.set(data.postId, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        for (const p of polls.values()) {
          if (p.id === where.id) {
            Object.assign(p, data);
            return p;
          }
        }
        throw new Error('poll not found');
      },
    },
    pollVote: {
      findMany: async ({ where }: any) => votes.filter((v) => v.pollId === where.pollId),
      findFirst: async ({ where }: any) =>
        votes.find(
          (v) =>
            v.pollId === where.pollId &&
            v.userId === where.userId &&
            v.optionIndex === where.optionIndex,
        ) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `v_${++voteSeq}`, ...data };
        votes.push(row);
        return row;
      },
      delete: async ({ where }: any) => {
        const row = votes.find((v) => v.id === where.id);
        votes = votes.filter((v) => v.id !== where.id);
        return row;
      },
      deleteMany: async ({ where }: any) => {
        const before = votes.length;
        votes = votes.filter((v) => !(v.pollId === where.pollId && v.userId === where.userId));
        return { count: before - votes.length };
      },
      count: async ({ where }: any) => votes.filter((v) => v.pollId === where.pollId).length,
    },
  };
}

const SEED = {
  id: 'poll_1',
  postId: 'post_1',
  question: 'Best language?',
  options: ['TypeScript', 'Rust', 'Go'],
};

describe('PollService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PollService;

  beforeEach(() => {
    prisma = createMockPrisma(SEED);
    service = new PollService(prisma as never);
  });

  it('records a vote and tallies it', async () => {
    const r = await service.vote('post_1', 'u1', 0);
    expect(r.options[0]!.votes).toBe(1);
    expect(r.totalVotes).toBe(1);
    expect(r.voterCount).toBe(1);
    expect(r.userVotes).toEqual([0]);
  });

  it('moves a single-choice vote when a different option is chosen', async () => {
    await service.vote('post_1', 'u1', 0);
    const r = await service.vote('post_1', 'u1', 1);
    expect(r.options[0]!.votes).toBe(0);
    expect(r.options[1]!.votes).toBe(1);
    expect(r.totalVotes).toBe(1);
    expect(r.userVotes).toEqual([1]);
  });

  it('toggles a vote off when the same option is repeated', async () => {
    await service.vote('post_1', 'u1', 2);
    const r = await service.vote('post_1', 'u1', 2);
    expect(r.options[2]!.votes).toBe(0);
    expect(r.totalVotes).toBe(0);
    expect(r.userVotes).toEqual([]);
  });

  it('allows multiple distinct options on a multi-choice poll', async () => {
    prisma = createMockPrisma({ ...SEED, allowMultiple: true });
    service = new PollService(prisma as never);
    await service.vote('post_1', 'u1', 0);
    const r = await service.vote('post_1', 'u1', 1);
    expect(r.options[0]!.votes).toBe(1);
    expect(r.options[1]!.votes).toBe(1);
    expect(r.userVotes).toEqual([0, 1]);
  });

  it('counts distinct voters', async () => {
    await service.vote('post_1', 'u1', 0);
    const r = await service.vote('post_1', 'u2', 0);
    expect(r.options[0]!.votes).toBe(2);
    expect(r.voterCount).toBe(2);
  });

  it('rejects an out-of-range option', async () => {
    await expect(service.vote('post_1', 'u1', 9)).rejects.toMatchObject({
      code: 'POLL_INVALID_OPTION',
    });
  });

  it('rejects votes after the poll closes', async () => {
    prisma = createMockPrisma({ ...SEED, endAt: new Date(Date.now() - 1000) });
    service = new PollService(prisma as never);
    await expect(service.vote('post_1', 'u1', 0)).rejects.toMatchObject({ code: 'POLL_CLOSED' });
  });

  it('404s when no poll exists for the post', async () => {
    prisma = createMockPrisma();
    service = new PollService(prisma as never);
    await expect(service.getResults('missing')).rejects.toMatchObject({ code: 'POLL_NOT_FOUND' });
  });

  it('creates a poll with valid options', async () => {
    prisma = createMockPrisma();
    service = new PollService(prisma as never);
    const poll = await service.createPoll({
      postId: 'post_9',
      question: 'Pick one',
      options: ['A', 'B'],
    });
    expect(poll.postId).toBe('post_9');
  });

  it('rejects a poll with fewer than 2 options', async () => {
    prisma = createMockPrisma();
    service = new PollService(prisma as never);
    await expect(
      service.createPoll({ postId: 'p', question: 'q', options: ['only'] }),
    ).rejects.toMatchObject({ code: 'POLL_TOO_FEW_OPTIONS' });
  });
});
