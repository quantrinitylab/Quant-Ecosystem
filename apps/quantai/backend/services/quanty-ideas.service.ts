import { createAppError } from '@quant/server-core';

/**
 * Quanty Ideas — proactive idea cards (PR-Q9).
 *
 * Ideas are *proposals*: the agent suggests them from user activity, or the
 * user creates their own. The user then saves or dismisses each card.
 * Dismissed ideas stay in the database but are hidden from the default feed.
 *
 * Honesty rules (per the repo's cross-cutting conventions):
 * - No fabricated rows: `list` returns only real persisted ideas, possibly [].
 * - Ownership is enforced per-row: a user can never see or mutate another
 *   user's ideas (missing/wrong-owner both surface as 404, never 403, so
 *   existence is not leaked).
 */

export type IdeaStatus = 'new' | 'saved' | 'dismissed';

export const IDEA_STATUSES: IdeaStatus[] = ['new', 'saved', 'dismissed'];

export interface QuantyIdeaRow {
  id: string;
  userId: string;
  title: string;
  description: string;
  emoji: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdeaCreateInput {
  title: string;
  description?: string;
  emoji?: string;
}

export interface IdeaUpdateInput {
  title?: string;
  description?: string;
  emoji?: string;
}

/** Structural slice of PrismaClient used by IdeasService (mockable in tests). */
export interface IdeasPrismaClient {
  quantyIdea: {
    findMany(args: {
      where: { userId: string; status?: string };
      orderBy: { createdAt: 'desc' };
    }): Promise<QuantyIdeaRow[]>;
    findUnique(args: { where: { id: string } }): Promise<QuantyIdeaRow | null>;
    create(args: {
      data: {
        userId: string;
        title: string;
        description: string;
        emoji: string;
        status: string;
      };
    }): Promise<QuantyIdeaRow>;
    update(args: {
      where: { id: string };
      data: Partial<Pick<QuantyIdeaRow, 'title' | 'description' | 'emoji' | 'status'>>;
    }): Promise<QuantyIdeaRow>;
    delete(args: { where: { id: string } }): Promise<QuantyIdeaRow>;
  };
}

const NOT_FOUND = () => createAppError('Idea not found', 404, 'IDEA_NOT_FOUND');

export class IdeasService {
  constructor(private readonly prisma: IdeasPrismaClient) {}

  /** Load a row and enforce ownership; 404 when missing or owned by someone else. */
  private async getOwned(id: string, userId: string): Promise<QuantyIdeaRow> {
    const row = await this.prisma.quantyIdea.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw NOT_FOUND();
    return row;
  }

  /** List the user's ideas, newest first. `status` filters; omitted = all. */
  async list(userId: string, status?: IdeaStatus): Promise<QuantyIdeaRow[]> {
    return this.prisma.quantyIdea.findMany({
      where: status ? { userId, status } : { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, userId: string): Promise<QuantyIdeaRow> {
    return this.getOwned(id, userId);
  }

  async create(userId: string, input: IdeaCreateInput): Promise<QuantyIdeaRow> {
    return this.prisma.quantyIdea.create({
      data: {
        userId,
        title: input.title,
        description: input.description ?? '',
        emoji: input.emoji ?? '💡',
        status: 'new',
      },
    });
  }

  async update(id: string, userId: string, input: IdeaUpdateInput): Promise<QuantyIdeaRow> {
    await this.getOwned(id, userId);
    return this.prisma.quantyIdea.update({ where: { id }, data: { ...input } });
  }

  async setStatus(id: string, userId: string, status: IdeaStatus): Promise<QuantyIdeaRow> {
    await this.getOwned(id, userId);
    return this.prisma.quantyIdea.update({ where: { id }, data: { status } });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.getOwned(id, userId);
    await this.prisma.quantyIdea.delete({ where: { id } });
  }
}
