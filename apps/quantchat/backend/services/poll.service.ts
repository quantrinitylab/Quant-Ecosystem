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

  async createPoll(
    chatId: string,
    creatorId: string,
    data: { question: string; options: string[]; allowMultiple?: boolean },
  ): Promise<PollRecord> {
    if (!data.question || !data.options || data.options.length < 2) {
      throw createAppError('Poll requires a question and at least 2 options', 400, 'INVALID_POLL');
    }

    const pollId = `poll_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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

  async getPollResults(pollId: string): Promise<{
    question: string;
    totalVotes: number;
    options: Array<{ text: string; votes: number; percentage: number; voters: string[] }>;
  }> {
    const poll = PollService.memoryStore.get(pollId);
    if (!poll) {
      throw createAppError('Poll not found', 404, 'POLL_NOT_FOUND');
    }

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
