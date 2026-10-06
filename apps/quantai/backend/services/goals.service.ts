/**
 * QuantyGoalsService — user goals (Muse S7 parity).
 *
 * A user goal has a title, optional description, category
 * (health | relationships | finance | custom) and a status
 * (tracking | done). Agent-completed tasks may PROPOSE goals via
 * `proposeGoal`; proposals are never auto-applied — they only become
 * real goals when the user explicitly accepts them.
 */
import { createAppError } from '@quant/server-core';

export const GOAL_CATEGORIES = ['health', 'relationships', 'finance', 'custom'] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export const GOAL_STATUSES = ['tracking', 'done'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const PROPOSAL_STATUSES = ['pending', 'accepted', 'dismissed'] as const;

export interface QuantyGoalRow {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface QuantyGoalProposalRow {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  source: string;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
}

/** Minimal structural Prisma slice — dependency-injected for testability. */
export interface GoalsPrismaClient {
  quantyGoal: {
    findMany: (args: Record<string, unknown>) => Promise<QuantyGoalRow[]>;
    findFirst: (args: { where: Record<string, unknown> }) => Promise<QuantyGoalRow | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<QuantyGoalRow>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<QuantyGoalRow>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
  quantyGoalProposal: {
    findMany: (args: Record<string, unknown>) => Promise<QuantyGoalProposalRow[]>;
    findFirst: (args: { where: Record<string, unknown> }) => Promise<QuantyGoalProposalRow | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<QuantyGoalProposalRow>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<QuantyGoalProposalRow>;
  };
}

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;

export interface CreateGoalInput {
  title: string;
  description?: string;
  category?: string;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  category?: string;
}

export interface ProposeGoalInput {
  title: string;
  description?: string;
  category?: string;
  source?: string;
}

export class QuantyGoalsService {
  constructor(private readonly prisma: GoalsPrismaClient) {}

  private normalizeCategory(category: unknown, fallback: GoalCategory = 'custom'): GoalCategory {
    if (typeof category === 'string' && (GOAL_CATEGORIES as readonly string[]).includes(category)) {
      return category as GoalCategory;
    }
    return fallback;
  }

  private validateTitle(title: unknown): string {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw createAppError('Goal title is required', 400, 'GOAL_TITLE_REQUIRED');
    }
    if (title.trim().length > MAX_TITLE) {
      throw createAppError(`Goal title must be at most ${MAX_TITLE} characters`, 400, 'GOAL_TITLE_TOO_LONG');
    }
    return title.trim();
  }

  private validateDescription(description: unknown): string {
    if (description === undefined || description === null) return '';
    if (typeof description !== 'string') {
      throw createAppError('Goal description must be a string', 400, 'GOAL_DESCRIPTION_INVALID');
    }
    if (description.length > MAX_DESCRIPTION) {
      throw createAppError(
        `Goal description must be at most ${MAX_DESCRIPTION} characters`,
        400,
        'GOAL_DESCRIPTION_TOO_LONG',
      );
    }
    return description;
  }

  async listGoals(userId: string, status?: GoalStatus): Promise<QuantyGoalRow[]> {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    return this.prisma.quantyGoal.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listProposals(userId: string, status: string = 'pending'): Promise<QuantyGoalProposalRow[]> {
    return this.prisma.quantyGoalProposal.findMany({
      where: { userId, status },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createGoal(userId: string, input: CreateGoalInput): Promise<QuantyGoalRow> {
    const title = this.validateTitle(input.title);
    const description = this.validateDescription(input.description);
    const category = this.normalizeCategory(input.category);
    return this.prisma.quantyGoal.create({
      data: { userId, title, description, category, status: 'tracking' },
    });
  }

  async updateGoal(userId: string, id: string, input: UpdateGoalInput): Promise<QuantyGoalRow> {
    const existing = await this.prisma.quantyGoal.findFirst({ where: { id, userId } });
    if (!existing) throw createAppError('Goal not found', 404, 'GOAL_NOT_FOUND');
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = this.validateTitle(input.title);
    if (input.description !== undefined) data.description = this.validateDescription(input.description);
    if (input.category !== undefined) data.category = this.normalizeCategory(input.category);
    return this.prisma.quantyGoal.update({ where: { id }, data });
  }

  async completeGoal(userId: string, id: string): Promise<QuantyGoalRow> {
    const existing = await this.prisma.quantyGoal.findFirst({ where: { id, userId } });
    if (!existing) throw createAppError('Goal not found', 404, 'GOAL_NOT_FOUND');
    return this.prisma.quantyGoal.update({
      where: { id },
      data: { status: 'done', completedAt: new Date() },
    });
  }

  async reopenGoal(userId: string, id: string): Promise<QuantyGoalRow> {
    const existing = await this.prisma.quantyGoal.findFirst({ where: { id, userId } });
    if (!existing) throw createAppError('Goal not found', 404, 'GOAL_NOT_FOUND');
    return this.prisma.quantyGoal.update({
      where: { id },
      data: { status: 'tracking', completedAt: null },
    });
  }

  async deleteGoal(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.quantyGoal.findFirst({ where: { id, userId } });
    if (!existing) throw createAppError('Goal not found', 404, 'GOAL_NOT_FOUND');
    await this.prisma.quantyGoal.delete({ where: { id } });
  }

  /**
   * Agent entry point: record a proposed goal. The proposal is stored as
   * `pending` and is NEVER promoted to a real goal without an explicit
   * user accept.
   */
  async proposeGoal(userId: string, input: ProposeGoalInput): Promise<QuantyGoalProposalRow> {
    const title = this.validateTitle(input.title);
    const description = this.validateDescription(input.description);
    const category = this.normalizeCategory(input.category);
    const source = typeof input.source === 'string' ? input.source.slice(0, 500) : '';
    return this.prisma.quantyGoalProposal.create({
      data: { userId, title, description, category, source, status: 'pending' },
    });
  }

  /** User accepts a proposal → a real QuantyGoal is created; proposal marked accepted. */
  async acceptProposal(userId: string, id: string): Promise<QuantyGoalRow> {
    const proposal = await this.prisma.quantyGoalProposal.findFirst({
      where: { id, userId, status: 'pending' },
    });
    if (!proposal) throw createAppError('Proposal not found', 404, 'GOAL_PROPOSAL_NOT_FOUND');
    const goal = await this.prisma.quantyGoal.create({
      data: {
        userId,
        title: proposal.title,
        description: proposal.description,
        category: proposal.category,
        status: 'tracking',
      },
    });
    await this.prisma.quantyGoalProposal.update({
      where: { id },
      data: { status: 'accepted', decidedAt: new Date() },
    });
    return goal;
  }

  /** User dismisses a proposal → marked dismissed, no goal created. */
  async dismissProposal(userId: string, id: string): Promise<QuantyGoalProposalRow> {
    const proposal = await this.prisma.quantyGoalProposal.findFirst({
      where: { id, userId, status: 'pending' },
    });
    if (!proposal) throw createAppError('Proposal not found', 404, 'GOAL_PROPOSAL_NOT_FOUND');
    return this.prisma.quantyGoalProposal.update({
      where: { id },
      data: { status: 'dismissed', decidedAt: new Date() },
    });
  }
}
