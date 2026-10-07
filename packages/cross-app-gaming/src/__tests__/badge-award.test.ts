import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadgeAwardService,
  BadgeValidationError,
  type GameBadgeRow,
} from '../services/badge-award.service.js';

function createMockPrisma() {
  const rows: GameBadgeRow[] = [];
  let n = 0;
  return {
    _rows: rows,
    gameBadge: {
      create: vi.fn(async ({ data }: any) => {
        const row: GameBadgeRow = {
          id: `gb-${++n}`,
          userId: data.userId,
          badgeType: data.badgeType,
          awardedAt: new Date(Date.now() + n), // strictly increasing for ordering
        };
        rows.push(row);
        return { ...row };
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        // supports composite-style { userId, badgeType } as well as { id }
        const found = rows.find((r) =>
          where.id !== undefined
            ? r.id === where.id
            : r.userId === where.userId && r.badgeType === where.badgeType,
        );
        return found ? { ...found } : null;
      }),
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        let out = rows.filter((r) => {
          if (where?.userId !== undefined && r.userId !== where.userId) return false;
          if (where?.badgeType !== undefined && r.badgeType !== where.badgeType) return false;
          return true;
        });
        if (orderBy?.awardedAt === 'desc') {
          out = [...out].sort((a, b) => b.awardedAt.getTime() - a.awardedAt.getTime());
        }
        return out.map((r) => ({ ...r }));
      }),
    },
  };
}

describe('BadgeAwardService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: BadgeAwardService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new BadgeAwardService(prisma as never);
  });

  describe('awardBadge', () => {
    it('creates a badge row the first time it is awarded', async () => {
      const res = await service.awardBadge('u1', 'first-win');
      expect(res.created).toBe(true);
      expect(res.badge).toMatchObject({ id: 'gb-1', userId: 'u1', badgeType: 'first-win' });
      expect(prisma.gameBadge.create).toHaveBeenCalledTimes(1);
      expect(prisma._rows).toHaveLength(1);
    });

    it('is IDEMPOTENT: re-awarding the same userId+badgeType does not duplicate', async () => {
      const first = await service.awardBadge('u1', 'first-win');
      const again = await service.awardBadge('u1', 'first-win');

      expect(first.created).toBe(true);
      expect(again.created).toBe(false);
      expect(again.badge.id).toBe(first.badge.id);
      // only one create call, only one stored row
      expect(prisma.gameBadge.create).toHaveBeenCalledTimes(1);
      expect(prisma._rows).toHaveLength(1);
    });

    it('treats different badge types and users as distinct', async () => {
      await service.awardBadge('u1', 'first-win');
      await service.awardBadge('u1', 'ten-wins');
      await service.awardBadge('u2', 'first-win');

      expect(prisma._rows).toHaveLength(3);
    });

    it('rejects missing userId / badgeType', async () => {
      await expect(service.awardBadge('', 'first-win')).rejects.toMatchObject({
        code: 'INVALID_USER',
      });
      await expect(service.awardBadge('u1', '   ')).rejects.toMatchObject({
        code: 'INVALID_BADGE_TYPE',
      });
      await expect(service.awardBadge('', 'first-win')).rejects.toBeInstanceOf(
        BadgeValidationError,
      );
    });
  });

  describe('listBadges', () => {
    it('returns all badges a user earned, newest first', async () => {
      await service.awardBadge('u1', 'first-win');
      await service.awardBadge('u1', 'ten-wins');
      await service.awardBadge('u2', 'first-win'); // other user, excluded

      const badges = await service.listBadges('u1');
      expect(badges.map((b) => b.badgeType)).toEqual(['ten-wins', 'first-win']);
    });

    it('returns an empty array for a user with no badges', async () => {
      expect(await service.listBadges('ghost')).toEqual([]);
    });

    it('rejects invalid input', async () => {
      await expect(service.listBadges('')).rejects.toBeInstanceOf(BadgeValidationError);
    });
  });

  describe('hasBadge', () => {
    it('reflects presence of a badge', async () => {
      await service.awardBadge('u1', 'first-win');

      expect(await service.hasBadge('u1', 'first-win')).toBe(true);
      expect(await service.hasBadge('u1', 'ten-wins')).toBe(false);
      expect(await service.hasBadge('u2', 'first-win')).toBe(false);
    });

    it('rejects invalid input', async () => {
      await expect(service.hasBadge('u1', '')).rejects.toMatchObject({
        code: 'INVALID_BADGE_TYPE',
      });
    });
  });
});
