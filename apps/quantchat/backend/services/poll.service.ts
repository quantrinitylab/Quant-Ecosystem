import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export interface PollRecord {
  id: string;
  chatId: string;
  creatorId: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  createdAt: Date;
  votes: Array<{ userId: string; optionIndex: number; createdAt: Date }>;
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

  async createPoll(
    chatId: string,
    creatorId: string,
    data: { question: string; options: string[]; allowMultiple?: boolean },
  ): Promise<PollRecord> {
    await this.requireMembership(chatId, creatorId);

    if (!data.question || !data.options || data.options.length < 2) {
      throw createAppError('Poll requires a question and at least 2 options', 400, 'INVALID_POLL');
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
      createdAt: new Date(),
      votes: [],
    };

    PollService.memoryStore.set(pollId, record);
    return record;
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
    totalVotes: number;
    options: Array<{ text: string; votes: number; percentage: number; voters: string[] }>;
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
      const voters = Array.from(new Set(optionVotes.map((v) => v.userId)));
      const votes = optionVotes.length;
      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 10000) / 100 : 0;

      return {
        text,
        votes,
        percentage,
        voters,
      };
    });

    return {
      question: poll.question,
      totalVotes,
      options: optionStats,
    };
  }
}
