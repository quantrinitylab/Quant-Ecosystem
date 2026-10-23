import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export type PollMode = 'standard' | 'quiz';

export interface PollRecord {
  id: string;
  chatId: string;
  creatorId: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  // QC-F-335: two orthogonal mode axes. `mode` is the scoring axis
  // (standard vs quiz); `isAnonymous` is the visibility axis. Records
  // created before this change never exist in the store (in-memory),
  // and new records always carry both fields with back-compat defaults.
  mode: PollMode;
  isAnonymous: boolean;
  // Quiz-only: the correct option and its optional explanation. These
  // live on the stored record but are EXPOSURE-GATED in every response
  // shape (see serializePoll / getPollResults reveal predicate).
  correctOptionIndex?: number;
  explanation?: string;
  // QC-F-549: the poll lifecycle's closing axis — orthogonal to the
  // QC-F-335 mode axes. `closesAt` exists ONLY when the creator declared
  // an expiry at creation (never a default); `closedAt` is set only by
  // an explicit creator close. A poll is closed when either holds (see
  // isPollClosed). Both live on the same in-memory record as everything
  // else — chat polls have no DB persistence (QC-F-071 owns that debt).
  closesAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  votes: Array<{ userId: string; optionIndex: number; createdAt: Date }>;
}

/**
 * QC-F-335: the only shape create/vote responses may take. Built by
 * `PollService.serializePoll` — routes never return the raw record,
 * because the raw record carries the full voter roster (`votes[].userId`)
 * and, for quizzes, the correct answer.
 */
export interface SerializedPoll {
  id: string;
  chatId: string;
  creatorId: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  mode: PollMode;
  isAnonymous: boolean;
  createdAt: Date;
  /** QC-F-549: always present — `isClosed` is the effective state at
   *  response time; `closedAt` is the real closing instant (the explicit
   *  close time, or the declared `closesAt` once it has passed), else null. */
  isClosed: boolean;
  closedAt: Date | null;
  /** Present ONLY when an expiry was declared at creation (QC-F-549). */
  closesAt?: Date;
  /** Full roster — present ONLY for non-anonymous polls (QC-F-268 case 9 pin). */
  votes?: Array<{ userId: string; optionIndex: number; createdAt: Date }>;
  /** Quiz answer — present ONLY when the reveal predicate holds. */
  correctOptionIndex?: number;
  explanation?: string;
  /** The requester's OWN chosen option indexes — every mode, every caller. */
  yourVote: number[];
  /** Quiz only, and only when the requester has voted. */
  yourCorrect?: boolean;
}

export class PollService {
  private static memoryStore = new Map<string, PollRecord>();

  constructor(private readonly prisma?: PrismaClient) {}

  /**
   * QC-F-268: polls are conversation-scoped, so every create/vote/results
   * call requires an ACTIVE membership row — the same 403 NOT_A_MEMBER
   * convention as MessageService / ThemeService (QC-F-095 pattern). A
   * nonexistent conversation yields the same 403 as a non-member: the
   * membership query returns null either way, and there is deliberately
   * no separate conversation lookup (no existence oracle). Fail-closed:
   * when the service was constructed without a Prisma client, membership
   * can never be proven, so the gate throws instead of being skipped.
   */
  private async requireMembership(conversationId: string, userId: string): Promise<void> {
    const membership = await this.prisma?.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }
  }

  /** QC-F-549: ONE place decides "closed" — explicit close, or a
   *  declared expiry that has passed. No timers: the check is lazy, at
   *  the moment of vote/results/serialize, which are the only moments
   *  the state is observable. */
  private isPollClosed(poll: PollRecord, now = new Date()): boolean {
    if (poll.closedAt) return true;
    if (poll.closesAt && poll.closesAt.getTime() <= now.getTime()) return true;
    return false;
  }

  private effectiveClosedAt(poll: PollRecord, now = new Date()): Date | null {
    if (poll.closedAt) return poll.closedAt;
    if (poll.closesAt && poll.closesAt.getTime() <= now.getTime()) return poll.closesAt;
    return null;
  }

  /**
   * QC-F-335 + QC-F-549: the quiz reveal predicate — ONE place, used by
   * both the create/vote serializer and getPollResults. The correct
   * answer may be exposed only to the poll's creator (they authored
   * it), to a member who has already voted, or — once the poll has
   * closed (creator close or declared expiry, QC-F-549) — to any member:
   * closing is what makes a quiz's result final, and the answer is part
   * of that final result. Every caller is membership-gated before this
   * predicate runs, so the closed branch never reaches a non-member.
   */
  private canRevealQuizAnswer(poll: PollRecord, requesterId: string): boolean {
    if (poll.mode !== 'quiz' || poll.correctOptionIndex === undefined) {
      return false;
    }
    return (
      requesterId === poll.creatorId ||
      poll.votes.some((v) => v.userId === requesterId) ||
      this.isPollClosed(poll)
    );
  }

  private yourVoteIndexes(poll: PollRecord, requesterId: string): number[] {
    return poll.votes.filter((v) => v.userId === requesterId).map((v) => v.optionIndex);
  }

  /**
   * QC-F-335: anonymous is an EXPOSURE contract, not a storage claim —
   * voter identity stays in the record (single-choice replace,
   * multiple-choice toggle and duplicate prevention are impossible
   * without it), but for anonymous polls no response ever carries
   * another user's id: the `votes` roster key is omitted entirely.
   * Quiz fields ride along only when the reveal predicate holds.
   */
  serializePoll(poll: PollRecord, requesterId: string): SerializedPoll {
    const yourVote = this.yourVoteIndexes(poll, requesterId);
    const serialized: SerializedPoll = {
      id: poll.id,
      chatId: poll.chatId,
      creatorId: poll.creatorId,
      question: poll.question,
      options: poll.options,
      allowMultiple: poll.allowMultiple,
      mode: poll.mode,
      isAnonymous: poll.isAnonymous,
      createdAt: poll.createdAt,
      isClosed: this.isPollClosed(poll),
      closedAt: this.effectiveClosedAt(poll),
      ...(poll.closesAt !== undefined ? { closesAt: poll.closesAt } : {}),
      yourVote,
    };

    if (!poll.isAnonymous) {
      serialized.votes = poll.votes.map((v) => ({ ...v }));
    }

    if (this.canRevealQuizAnswer(poll, requesterId)) {
      serialized.correctOptionIndex = poll.correctOptionIndex;
      if (poll.explanation !== undefined) {
        serialized.explanation = poll.explanation;
      }
      if (yourVote.length > 0 && poll.correctOptionIndex !== undefined) {
        serialized.yourCorrect = yourVote.includes(poll.correctOptionIndex);
      }
    }

    return serialized;
  }

  async createPoll(
    chatId: string,
    creatorId: string,
    data: {
      question: string;
      options: string[];
      allowMultiple?: boolean;
      mode?: PollMode;
      isAnonymous?: boolean;
      correctOptionIndex?: number;
      explanation?: string;
      closesAt?: string;
    },
  ): Promise<PollRecord> {
    await this.requireMembership(chatId, creatorId);

    if (!data.question || !data.options || data.options.length < 2) {
      throw createAppError('Poll requires a question and at least 2 options', 400, 'INVALID_POLL');
    }

    // QC-F-335: semantic mode validation lives at the service (the
    // trust boundary — direct service consumers never pass the route
    // schema). Invalid definitions are rejected loudly with 400
    // INVALID_POLL; nothing is silently stripped or coerced.
    const mode: PollMode = data.mode ?? 'standard';
    if (mode !== 'standard' && mode !== 'quiz') {
      throw createAppError('Poll mode must be standard or quiz', 400, 'INVALID_POLL');
    }
    if (mode === 'quiz') {
      if (data.allowMultiple) {
        throw createAppError('Quiz polls are single-choice', 400, 'INVALID_POLL');
      }
      if (
        data.correctOptionIndex === undefined ||
        !Number.isInteger(data.correctOptionIndex) ||
        data.correctOptionIndex < 0 ||
        data.correctOptionIndex >= data.options.length
      ) {
        throw createAppError(
          'Quiz polls require a correctOptionIndex within the options range',
          400,
          'INVALID_POLL',
        );
      }
    } else if (data.correctOptionIndex !== undefined || data.explanation !== undefined) {
      throw createAppError(
        'correctOptionIndex and explanation are only valid for quiz polls',
        400,
        'INVALID_POLL',
      );
    }

    // QC-F-549: a declared expiry is the ONLY automatic close. It must
    // be a real, future instant — a past or unparseable value is a loud
    // 400, never silently dropped (a dropped expiry would leave the poll
    // open forever while the creator believes it timed).
    let closesAt: Date | undefined;
    if (data.closesAt !== undefined) {
      const parsed = new Date(data.closesAt);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        throw createAppError('closesAt must be a future date and time', 400, 'INVALID_POLL');
      }
      closesAt = parsed;
    }

    // QC-F-268: unguessable id (house precedent: media.service.ts uses
    // `media_${crypto.randomUUID()}`). The old `Date.now()` + 5-char
    // Math.random suffix made other users' polls enumerable. No format
    // gate is applied on lookup — ids minted before this change keep
    // working for the rest of this process's life.
    const pollId = `poll_${randomUUID()}`;
    const record: PollRecord = {
      id: pollId,
      chatId,
      creatorId,
      question: data.question,
      options: data.options,
      allowMultiple: data.allowMultiple ?? false,
      mode,
      isAnonymous: data.isAnonymous ?? false,
      ...(mode === 'quiz'
        ? {
            correctOptionIndex: data.correctOptionIndex,
            ...(data.explanation !== undefined ? { explanation: data.explanation } : {}),
          }
        : {}),
      ...(closesAt !== undefined ? { closesAt } : {}),
      createdAt: new Date(),
      votes: [],
    };

    PollService.memoryStore.set(pollId, record);
    return record;
  }

  async closePoll(pollId: string, userId: string): Promise<PollRecord> {
    const poll = PollService.memoryStore.get(pollId);
    if (!poll) {
      throw createAppError('Poll not found', 404, 'POLL_NOT_FOUND');
    }

    // QC-F-549 + QC-F-268 family order: membership BEFORE the creator
    // check — a non-member learns nothing, not even that this poll has
    // a creator gate or a closed state.
    await this.requireMembership(poll.chatId, userId);

    if (poll.creatorId !== userId) {
      throw createAppError('Only the poll creator can close this poll', 403, 'NOT_POLL_CREATOR');
    }

    // Already closed — by hand or by a declared expiry that has passed —
    // is a conflict, and the original closing instant is never rewritten.
    if (this.isPollClosed(poll)) {
      throw createAppError('Poll is already closed', 409, 'POLL_ALREADY_CLOSED');
    }

    poll.closedAt = new Date();
    PollService.memoryStore.set(pollId, poll);
    return poll;
  }

  async votePoll(pollId: string, userId: string, optionIndex: number): Promise<PollRecord> {
    const poll = PollService.memoryStore.get(pollId);
    if (!poll) {
      throw createAppError('Poll not found', 404, 'POLL_NOT_FOUND');
    }

    // QC-F-268: pinned order 404 → 403 → 400 — membership is checked
    // before the option index, so a non-member learns nothing about the
    // poll's options from the error either.
    await this.requireMembership(poll.chatId, userId);

    // QC-F-549: a closed poll's tally is final — no new votes, no vote
    // changes, no toggles. Checked after membership (a non-member must
    // not learn the poll's state, QC-F-268 order) and before the option
    // range (a closed poll rejects every vote alike).
    if (this.isPollClosed(poll)) {
      throw createAppError('This poll is closed', 409, 'POLL_CLOSED');
    }

    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      throw createAppError('Invalid option index', 400, 'INVALID_OPTION');
    }

    if (!poll.allowMultiple) {
      // Remove previous vote by this user if single choice
      poll.votes = poll.votes.filter((v) => v.userId !== userId);
    } else {
      // If allowMultiple, toggle vote if already voted for this option, or add
      const existingIdx = poll.votes.findIndex(
        (v) => v.userId === userId && v.optionIndex === optionIndex,
      );
      if (existingIdx >= 0) {
        poll.votes.splice(existingIdx, 1);
        PollService.memoryStore.set(pollId, poll);
        return poll;
      }
    }

    poll.votes.push({
      userId,
      optionIndex,
      createdAt: new Date(),
    });

    PollService.memoryStore.set(pollId, poll);
    return poll;
  }

  async getPollResults(
    pollId: string,
    requesterId: string,
  ): Promise<{
    question: string;
    mode: PollMode;
    isAnonymous: boolean;
    totalVotes: number;
    yourVote: number[];
    isClosed: boolean;
    closedAt: Date | null;
    closesAt?: Date;
    correctOptionIndex?: number;
    explanation?: string;
    yourCorrect?: boolean;
    options: Array<{ text: string; votes: number; percentage: number; voters?: string[] }>;
  }> {
    const poll = PollService.memoryStore.get(pollId);
    if (!poll) {
      throw createAppError('Poll not found', 404, 'POLL_NOT_FOUND');
    }

    // QC-F-268: results expose the question and every option's voter
    // userIds, so they are members-only — a non-member gets the 403
    // above, not even the counts.
    await this.requireMembership(poll.chatId, requesterId);

    const totalVotes = poll.votes.length;

    const optionStats = poll.options.map((text, idx) => {
      const optionVotes = poll.votes.filter((v) => v.optionIndex === idx);
      const votes = optionVotes.length;
      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 10000) / 100 : 0;

      // QC-F-335: for anonymous polls the `voters` key is omitted
      // entirely — an empty array would read as "nobody voted", which
      // is false. Standard polls keep the QC-F-268 pinned roster.
      if (poll.isAnonymous) {
        return { text, votes, percentage };
      }
      const voters = Array.from(new Set(optionVotes.map((v) => v.userId)));
      return {
        text,
        votes,
        percentage,
        voters,
      };
    });

    const yourVote = this.yourVoteIndexes(poll, requesterId);
    const results: {
      question: string;
      mode: PollMode;
      isAnonymous: boolean;
      totalVotes: number;
      yourVote: number[];
      isClosed: boolean;
      closedAt: Date | null;
      closesAt?: Date;
      correctOptionIndex?: number;
      explanation?: string;
      yourCorrect?: boolean;
      options: Array<{ text: string; votes: number; percentage: number; voters?: string[] }>;
    } = {
      question: poll.question,
      mode: poll.mode,
      isAnonymous: poll.isAnonymous,
      totalVotes,
      yourVote,
      isClosed: this.isPollClosed(poll),
      closedAt: this.effectiveClosedAt(poll),
      ...(poll.closesAt !== undefined ? { closesAt: poll.closesAt } : {}),
      options: optionStats,
    };

    // QC-F-335 + QC-F-549: the quiz answer is revealed only under the
    // shared predicate (creator, a member who has voted, or any member
    // once the poll has closed). The poll being a quiz (`mode`) is NOT
    // hidden — only the answer is.
    if (this.canRevealQuizAnswer(poll, requesterId)) {
      results.correctOptionIndex = poll.correctOptionIndex;
      if (poll.explanation !== undefined) {
        results.explanation = poll.explanation;
      }
      if (yourVote.length > 0 && poll.correctOptionIndex !== undefined) {
        results.yourCorrect = yourVote.includes(poll.correctOptionIndex);
      }
    }

    return results;
  }
}
