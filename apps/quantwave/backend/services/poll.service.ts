// ============================================================================
// QuantSync - Poll Service (poll creation + voting + results)
// ============================================================================
//
// Backs the (previously dead) `/posts/:id/poll/vote` surface. The Next.js proxy
// already forwards to the backend, but no backend route/service existed, so poll
// voting 404'd end-to-end. This service wires the existing Prisma `Poll` /
// `PollVote` models with real, integrity-preserving voting:
//   - one vote per (poll, user) for single-choice polls; multiple distinct
//     options allowed only when `allowMultiple`.
//   - re-voting the SAME option on a single-choice poll toggles it off; voting a
//     DIFFERENT option moves the vote (no double counting).
//   - votes are rejected after `endAt`.
//   - `voterCount` (distinct voters) is kept in sync.
//
// Narrow, injected prisma interface (mirrors InteractionService) so the service
// is fully unit-testable with a mock prisma.

import { createAppError } from '@quant/server-core';

export interface PollOptionResult {
  index: number;
  label: string;
  votes: number;
}

export interface PollResults {
  pollId: string;
  postId: string;
  question: string;
  options: PollOptionResult[];
  totalVotes: number;
  voterCount: number;
  allowMultiple: boolean;
  endAt: Date | null;
  closed: boolean;
  /** Option indices the current caller has selected (when a userId is known). */
  userVotes: number[];
}

interface PollRow {
  id: string;
  postId: string;
  question: string;
  options: unknown;
  endAt: Date | null;
  voterCount: number;
  allowMultiple: boolean;
}

interface PollVoteRow {
  id: string;
  pollId: string;
  userId: string;
  optionIndex: number;
}

export interface PollPrisma {
  poll: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<PollRow | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<PollRow>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<PollRow>;
  };
  pollVote: {
    findMany: (args: Record<string, unknown>) => Promise<PollVoteRow[]>;
    findFirst: (args: Record<string, unknown>) => Promise<PollVoteRow | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<PollVoteRow>;
    delete: (args: { where: Record<string, unknown> }) => Promise<PollVoteRow>;
    deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
}

const MAX_OPTIONS = 12;

export class PollService {
  constructor(private readonly prisma: PollPrisma) {}

  private parseOptions(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw.map((o) => String(o));
    }
    return [];
  }

  /** Create a poll attached to an existing POLL post (1:1 with the post). */
  async createPoll(input: {
    postId: string;
    question: string;
    options: string[];
    endAt?: Date | null;
    allowMultiple?: boolean;
  }): Promise<PollRow> {
    const question = input.question?.trim() ?? '';
    if (!question) {
      throw createAppError('Poll question is required', 400, 'POLL_QUESTION_REQUIRED');
    }
    const options = (input.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0);
    if (options.length < 2) {
      throw createAppError('A poll needs at least 2 options', 400, 'POLL_TOO_FEW_OPTIONS');
    }
    if (options.length > MAX_OPTIONS) {
      throw createAppError(
        `A poll allows at most ${MAX_OPTIONS} options`,
        400,
        'POLL_TOO_MANY_OPTIONS',
      );
    }

    const existing = await this.prisma.poll.findUnique({ where: { postId: input.postId } });
    if (existing) {
      throw createAppError('This post already has a poll', 409, 'POLL_ALREADY_EXISTS');
    }

    return this.prisma.poll.create({
      data: {
        postId: input.postId,
        question,
        options,
        endAt: input.endAt ?? null,
        allowMultiple: input.allowMultiple ?? false,
        voterCount: 0,
      },
    });
  }

  private async pollForPost(postId: string): Promise<PollRow> {
    const poll = await this.prisma.poll.findUnique({ where: { postId } });
    if (!poll) {
      throw createAppError('Poll not found', 404, 'POLL_NOT_FOUND');
    }
    return poll;
  }

  /**
   * Cast (or toggle) the caller's vote on a poll option.
   * - Rejects votes after `endAt`.
   * - Validates `optionIndex` against the poll's options.
   * - Single-choice: voting the same option again clears it; a different option
   *   replaces the prior vote. Multi-choice: each option toggles independently.
   */
  async vote(postId: string, userId: string, optionIndex: number): Promise<PollResults> {
    const poll = await this.pollForPost(postId);
    const options = this.parseOptions(poll.options);

    if (poll.endAt && poll.endAt.getTime() <= Date.now()) {
      throw createAppError('This poll has closed', 409, 'POLL_CLOSED');
    }
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
      throw createAppError('Invalid poll option', 400, 'POLL_INVALID_OPTION');
    }

    const existingForOption = await this.prisma.pollVote.findFirst({
      where: { pollId: poll.id, userId, optionIndex },
    });

    if (existingForOption) {
      // Toggle this option off.
      await this.prisma.pollVote.delete({ where: { id: existingForOption.id } });
    } else {
      if (!poll.allowMultiple) {
        // Single-choice: clear any other selection first so the vote moves.
        await this.prisma.pollVote.deleteMany({ where: { pollId: poll.id, userId } });
      }
      await this.prisma.pollVote.create({
        data: { pollId: poll.id, userId, optionIndex },
      });
    }

    // Recompute distinct voter count and persist it.
    const voters = await this.prisma.pollVote.findMany({ where: { pollId: poll.id } });
    const distinctVoters = new Set(voters.map((v) => v.userId)).size;
    await this.prisma.poll.update({
      where: { id: poll.id },
      data: { voterCount: distinctVoters },
    });

    return this.tally(poll, options, voters, userId);
  }

  /** Read a poll's current results (optionally annotated with the caller's votes). */
  async getResults(postId: string, userId?: string): Promise<PollResults> {
    const poll = await this.pollForPost(postId);
    const options = this.parseOptions(poll.options);
    const voters = await this.prisma.pollVote.findMany({ where: { pollId: poll.id } });
    return this.tally(poll, options, voters, userId);
  }

  private tally(
    poll: PollRow,
    options: string[],
    votes: PollVoteRow[],
    userId?: string,
  ): PollResults {
    const counts = new Array<number>(options.length).fill(0);
    for (const v of votes) {
      if (v.optionIndex >= 0 && v.optionIndex < counts.length) {
        counts[v.optionIndex] = (counts[v.optionIndex] ?? 0) + 1;
      }
    }
    const userVotes = userId
      ? votes
          .filter((v) => v.userId === userId)
          .map((v) => v.optionIndex)
          .sort((a, b) => a - b)
      : [];

    return {
      pollId: poll.id,
      postId: poll.postId,
      question: poll.question,
      options: options.map((label, index) => ({ index, label, votes: counts[index] ?? 0 })),
      totalVotes: votes.length,
      voterCount: new Set(votes.map((v) => v.userId)).size,
      allowMultiple: poll.allowMultiple,
      endAt: poll.endAt,
      closed: Boolean(poll.endAt && poll.endAt.getTime() <= Date.now()),
      userVotes,
    };
  }
}
