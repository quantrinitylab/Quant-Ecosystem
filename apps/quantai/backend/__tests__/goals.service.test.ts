import { describe, it, expect, beforeEach } from 'vitest';
import {
  QuantyGoalsService,
  type GoalsPrismaClient,
  type QuantyGoalRow,
  type QuantyGoalProposalRow,
} from '../services/goals.service';

// ---------------------------------------------------------------------------
// In-memory fake of the structural Prisma slice used by QuantyGoalsService.
// ---------------------------------------------------------------------------

function createFakePrisma(): GoalsPrismaClient & {
  _goals: Map<string, QuantyGoalRow>;
  _proposals: Map<string, QuantyGoalProposalRow>;
} {
  const goals = new Map<string, QuantyGoalRow>();
  const proposals = new Map<string, QuantyGoalProposalRow>();
  let seq = 0;
  const nextId = () => `goal_${++seq}`;

  const matches = (row: { userId: string; status: string }, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (row as Record<string, unknown>)[k] === v);

  return {
    _goals: goals,
    _proposals: proposals,
    quantyGoal: {
      findMany: async (args: Record<string, unknown>) => {
        const where = (args.where ?? {}) as Record<string, unknown>;
        return [...goals.values()].filter((r) => matches(r, where));
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        [...goals.values()].find((r) => matches(r, where)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row: QuantyGoalRow = {
          id: nextId(),
          userId: data.userId as string,
          title: data.title as string,
          description: (data.description as string) ?? '',
          category: (data.category as string) ?? 'custom',
          status: (data.status as string) ?? 'tracking',
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        };
        goals.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = goals.get(where.id);
        if (!row) throw new Error('not found');
        const updated = { ...row, ...(data as Partial<QuantyGoalRow>), updatedAt: new Date() };
        goals.set(row.id, updated);
        return updated;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        goals.delete(where.id);
        return {};
      },
    },
    quantyGoalProposal: {
      findMany: async (args: Record<string, unknown>) => {
        const where = (args.where ?? {}) as Record<string, unknown>;
        return [...proposals.values()].filter((r) => matches(r, where));
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        [...proposals.values()].find((r) => matches(r, where)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row: QuantyGoalProposalRow = {
          id: nextId(),
          userId: data.userId as string,
          title: data.title as string,
          description: (data.description as string) ?? '',
          category: (data.category as string) ?? 'custom',
          source: (data.source as string) ?? '',
          status: (data.status as string) ?? 'pending',
          createdAt: now,
          decidedAt: null,
        };
        proposals.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = proposals.get(where.id);
        if (!row) throw new Error('not found');
        const updated = { ...row, ...(data as Partial<QuantyGoalProposalRow>) };
        proposals.set(row.id, updated);
        return updated;
      },
    },
  };
}

describe('QuantyGoalsService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let service: QuantyGoalsService;
  const userId = 'user_1';

  beforeEach(() => {
    prisma = createFakePrisma();
    service = new QuantyGoalsService(prisma);
  });

  describe('CRUD', () => {
    it('creates a goal with title, description and category', async () => {
      const goal = await service.createGoal(userId, {
        title: 'Run 5k',
        description: 'Three times a week',
        category: 'health',
      });
      expect(goal.title).toBe('Run 5k');
      expect(goal.description).toBe('Three times a week');
      expect(goal.category).toBe('health');
      expect(goal.status).toBe('tracking');
      expect(goal.completedAt).toBeNull();
    });

    it('rejects an empty title', async () => {
      await expect(service.createGoal(userId, { title: '   ' })).rejects.toMatchObject({
        code: 'GOAL_TITLE_REQUIRED',
      });
    });

    it('falls back to custom for unknown categories', async () => {
      const goal = await service.createGoal(userId, { title: 'Mystery', category: 'nope' });
      expect(goal.category).toBe('custom');
    });

    it('updates title, description and category', async () => {
      const goal = await service.createGoal(userId, { title: 'Old' });
      const updated = await service.updateGoal(userId, goal.id, {
        title: 'New',
        description: 'Details',
        category: 'finance',
      });
      expect(updated.title).toBe('New');
      expect(updated.description).toBe('Details');
      expect(updated.category).toBe('finance');
    });

    it('404s when updating another user\'s goal', async () => {
      const goal = await service.createGoal(userId, { title: 'Mine' });
      await expect(service.updateGoal('user_2', goal.id, { title: 'Yours' })).rejects.toMatchObject({
        code: 'GOAL_NOT_FOUND',
      });
    });

    it('deletes a goal', async () => {
      const goal = await service.createGoal(userId, { title: 'Temp' });
      await service.deleteGoal(userId, goal.id);
      expect(await service.listGoals(userId)).toHaveLength(0);
    });
  });

  describe('category filter', () => {
    it('lists goals filtered by status', async () => {
      await service.createGoal(userId, { title: 'A' });
      const done = await service.createGoal(userId, { title: 'B' });
      await service.completeGoal(userId, done.id);

      expect(await service.listGoals(userId, 'tracking')).toHaveLength(1);
      expect(await service.listGoals(userId, 'done')).toHaveLength(1);
      expect(await service.listGoals(userId)).toHaveLength(2);
    });

    it('does not leak goals across users', async () => {
      await service.createGoal(userId, { title: 'Mine' });
      expect(await service.listGoals('user_2')).toHaveLength(0);
    });
  });

  describe('complete / uncomplete', () => {
    it('completes a goal and sets completedAt', async () => {
      const goal = await service.createGoal(userId, { title: 'Finish me' });
      const completed = await service.completeGoal(userId, goal.id);
      expect(completed.status).toBe('done');
      expect(completed.completedAt).toBeInstanceOf(Date);
    });

    it('reopens a completed goal and clears completedAt', async () => {
      const goal = await service.createGoal(userId, { title: 'Finish me' });
      await service.completeGoal(userId, goal.id);
      const reopened = await service.reopenGoal(userId, goal.id);
      expect(reopened.status).toBe('tracking');
      expect(reopened.completedAt).toBeNull();
    });
  });

  describe('agent proposals', () => {
    it('proposeGoal stores a PENDING proposal and never auto-applies it', async () => {
      const proposal = await service.proposeGoal(userId, {
        title: 'Read 10 pages daily',
        source: 'task_abc completed',
      });
      expect(proposal.status).toBe('pending');
      // No real goal was created — the user's goal list is untouched.
      expect(await service.listGoals(userId)).toHaveLength(0);
      expect(await service.listProposals(userId)).toHaveLength(1);
    });

    it('acceptProposal creates a real goal and marks the proposal accepted', async () => {
      const proposal = await service.proposeGoal(userId, { title: 'Meditate' });
      const goal = await service.acceptProposal(userId, proposal.id);
      expect(goal.title).toBe('Meditate');
      expect(goal.status).toBe('tracking');
      expect(await service.listGoals(userId)).toHaveLength(1);
      expect(await service.listProposals(userId)).toHaveLength(0);

      const stored = prisma._proposals.get(proposal.id)!;
      expect(stored.status).toBe('accepted');
      expect(stored.decidedAt).toBeInstanceOf(Date);
    });

    it('dismissProposal creates no goal and marks the proposal dismissed', async () => {
      const proposal = await service.proposeGoal(userId, { title: 'Nope' });
      await service.dismissProposal(userId, proposal.id);
      expect(await service.listGoals(userId)).toHaveLength(0);
      const stored = prisma._proposals.get(proposal.id)!;
      expect(stored.status).toBe('dismissed');
    });

    it('cannot accept an already-decided proposal', async () => {
      const proposal = await service.proposeGoal(userId, { title: 'Once' });
      await service.dismissProposal(userId, proposal.id);
      await expect(service.acceptProposal(userId, proposal.id)).rejects.toMatchObject({
        code: 'GOAL_PROPOSAL_NOT_FOUND',
      });
    });
  });
});
