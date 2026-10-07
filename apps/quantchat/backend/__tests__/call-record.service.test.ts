// ============================================================================
// Unit tests — CallRecordService (durable call history)
//
// Live call signaling keeps only ephemeral in-memory state; CallRecordService
// persists the call lifecycle to the Prisma `Call` model so history survives
// restarts. A live PostgreSQL is not available in the sandbox, so — mirroring
// the repo's fake-key-prisma approach — these tests drive the REAL
// CallRecordService against a faithful in-memory model of the exact `call`
// delegate operations it issues:
//
//   prisma.call.create / update / findUnique / findFirst / findMany / count
//
// Covers:
//   * recordStarted creates an ACTIVE row with startedAt + normalized participants
//   * recordStarted is idempotent on roomId (no duplicate history rows)
//   * recordEnded marks ENDED, stamps endedAt, computes duration (seconds)
//   * recordEnded is idempotent for already-terminal calls
//   * recordEnded rejects an unknown call (404) and missing id (400)
//   * listHistory is user-scoped (initiator OR participant) and newest-first
//   * listHistory paginates and reports total
//   * validation: recordStarted rejects missing conversationId/initiatorId
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  CallRecordService,
  type CallRecordPrisma,
  type CallRow,
} from '../services/call-record.service';

// ---------------------------------------------------------------------------
// In-memory fake of the Prisma `call` delegate (the durable tier).
// ---------------------------------------------------------------------------
function createFakeCallPrisma(): CallRecordPrisma & { __rows: CallRow[] } {
  const rows: CallRow[] = [];
  let idSeq = 0;
  // Monotonic clock so createdAt ordering is deterministic regardless of how
  // fast the test runs (real wall-clock ms can collide).
  let clock = 1_700_000_000_000;
  const tick = (): Date => new Date((clock += 1000));

  const matches = (row: CallRow, where: Record<string, unknown>): boolean => {
    // Support the exact shapes CallRecordService issues.
    if ('id' in where && row.id !== where['id']) {
      return false;
    }
    if ('roomId' in where && row.roomId !== where['roomId']) {
      return false;
    }
    if ('OR' in where && Array.isArray(where['OR'])) {
      const clauses = where['OR'] as Array<Record<string, unknown>>;
      return clauses.some((clause) => {
        if ('initiatorId' in clause) {
          return row.initiatorId === clause['initiatorId'];
        }
        if ('participants' in clause) {
          const p = clause['participants'] as { array_contains?: string };
          const list = Array.isArray(row.participants) ? (row.participants as string[]) : [];
          return p.array_contains !== undefined && list.includes(p.array_contains);
        }
        return false;
      });
    }
    return true;
  };

  return {
    call: {
      async create({ data }) {
        const now = tick();
        const row: CallRow = {
          id: `call_${(idSeq += 1)}`,
          conversationId: String(data['conversationId']),
          initiatorId: String(data['initiatorId']),
          type: (data['type'] as CallRow['type']) ?? 'VIDEO',
          status: (data['status'] as CallRow['status']) ?? 'RINGING',
          startedAt: (data['startedAt'] as Date | undefined) ?? null,
          endedAt: (data['endedAt'] as Date | undefined) ?? null,
          duration: (data['duration'] as number | undefined) ?? null,
          participants: (data['participants'] as unknown) ?? [],
          roomId: (data['roomId'] as string | null | undefined) ?? null,
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
        return { ...row };
      },
      async update({ where, data }) {
        const row = rows.find((r) => r.id === where.id);
        if (!row) {
          throw new Error(`No Call row with id ${where.id}`);
        }
        Object.assign(row, data, { updatedAt: tick() });
        return { ...row };
      },
      async findUnique({ where }) {
        const row = rows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      },
      async findFirst({ where }) {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      },
      async findMany({ where, orderBy, skip, take }) {
        let result = rows.filter((r) => matches(r, where));
        const order = Array.isArray(orderBy) ? orderBy[0] : orderBy;
        if (order && 'createdAt' in order) {
          const dir = (order as { createdAt: 'asc' | 'desc' }).createdAt;
          result = result.sort((a, b) =>
            dir === 'desc'
              ? b.createdAt.getTime() - a.createdAt.getTime()
              : a.createdAt.getTime() - b.createdAt.getTime(),
          );
        }
        if (typeof skip === 'number') {
          result = result.slice(skip);
        }
        if (typeof take === 'number') {
          result = result.slice(0, take);
        }
        return result.map((r) => ({ ...r }));
      },
      async count({ where }) {
        return rows.filter((r) => matches(r, where)).length;
      },
    },
    __rows: rows,
  };
}

describe('CallRecordService — durable call history', () => {
  // --------------------------------------------------------------------------
  // recordStarted
  // --------------------------------------------------------------------------
  describe('recordStarted', () => {
    it('creates an ACTIVE row with startedAt and the initiator included', async () => {
      const prisma = createFakeCallPrisma();
      const service = new CallRecordService(prisma);

      const row = await service.recordStarted({
        conversationId: 'conv-1',
        initiatorId: 'alice',
        type: 'AUDIO',
        roomId: 'room-1',
        participants: ['bob', 'carol'],
      });

      expect(row.status).toBe('ACTIVE');
      expect(row.type).toBe('AUDIO');
      expect(row.startedAt).toBeInstanceOf(Date);
      expect(row.roomId).toBe('room-1');
      expect(row.participants).toEqual(['alice', 'bob', 'carol']);
      expect(prisma.__rows).toHaveLength(1);
    });

    it('defaults the call type to VIDEO and de-duplicates participants', async () => {
      const service = new CallRecordService(createFakeCallPrisma());

      const row = await service.recordStarted({
        conversationId: 'conv-1',
        initiatorId: 'alice',
        participants: ['alice', 'bob', 'bob'],
      });

      expect(row.type).toBe('VIDEO');
      expect(row.participants).toEqual(['alice', 'bob']);
    });

    it('is idempotent on roomId — a repeated start returns the same row', async () => {
      const prisma = createFakeCallPrisma();
      const service = new CallRecordService(prisma);

      const first = await service.recordStarted({
        conversationId: 'conv-1',
        initiatorId: 'alice',
        roomId: 'room-1',
        participants: ['bob'],
      });
      const second = await service.recordStarted({
        conversationId: 'conv-1',
        initiatorId: 'alice',
        roomId: 'room-1',
        participants: ['bob'],
      });

      expect(second.id).toBe(first.id);
      expect(prisma.__rows).toHaveLength(1);
    });

    it('rejects a missing conversationId', async () => {
      const service = new CallRecordService(createFakeCallPrisma());
      await expect(
        service.recordStarted({ conversationId: '  ', initiatorId: 'alice', participants: [] }),
      ).rejects.toThrow('conversationId is required');
    });

    it('rejects a missing initiatorId', async () => {
      const service = new CallRecordService(createFakeCallPrisma());
      await expect(
        service.recordStarted({ conversationId: 'conv-1', initiatorId: '', participants: [] }),
      ).rejects.toThrow('initiatorId is required');
    });
  });

  // --------------------------------------------------------------------------
  // recordEnded
  // --------------------------------------------------------------------------
  describe('recordEnded', () => {
    it('marks the call ENDED, stamps endedAt, and computes duration in seconds', async () => {
      const prisma = createFakeCallPrisma();
      const service = new CallRecordService(prisma);

      const started = await service.recordStarted({
        conversationId: 'conv-1',
        initiatorId: 'alice',
        roomId: 'room-1',
        participants: ['bob'],
      });

      const startedAt = started.startedAt!;
      const endedAt = new Date(startedAt.getTime() + 95_000); // 95 seconds later
      const ended = await service.recordEnded(started.id, { endedAt });

      expect(ended.status).toBe('ENDED');
      expect(ended.endedAt).toEqual(endedAt);
      expect(ended.duration).toBe(95);
    });

    it('is idempotent — re-ending a terminal call does not overwrite duration', async () => {
      const service = new CallRecordService(createFakeCallPrisma());

      const started = await service.recordStarted({
        conversationId: 'conv-1',
        initiatorId: 'alice',
        roomId: 'room-1',
        participants: ['bob'],
      });
      const firstEnd = await service.recordEnded(started.id, {
        endedAt: new Date(started.startedAt!.getTime() + 10_000),
      });
      const secondEnd = await service.recordEnded(started.id, {
        endedAt: new Date(started.startedAt!.getTime() + 999_000),
      });

      expect(firstEnd.duration).toBe(10);
      expect(secondEnd.duration).toBe(10); // unchanged
      expect(secondEnd.endedAt).toEqual(firstEnd.endedAt);
    });

    it('rejects an unknown call id with 404', async () => {
      const service = new CallRecordService(createFakeCallPrisma());
      await expect(service.recordEnded('does-not-exist')).rejects.toThrow('Call record not found');
    });

    it('rejects a missing call id with 400', async () => {
      const service = new CallRecordService(createFakeCallPrisma());
      await expect(service.recordEnded('  ')).rejects.toThrow('callId is required');
    });

    it('never produces a negative duration when endedAt precedes startedAt', async () => {
      const service = new CallRecordService(createFakeCallPrisma());
      const started = await service.recordStarted({
        conversationId: 'conv-1',
        initiatorId: 'alice',
        roomId: 'room-1',
        participants: ['bob'],
      });
      const ended = await service.recordEnded(started.id, {
        endedAt: new Date(started.startedAt!.getTime() - 5_000),
      });
      expect(ended.duration).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // listHistory
  // --------------------------------------------------------------------------
  describe('listHistory', () => {
    async function seed(service: CallRecordService) {
      // alice initiates two; bob initiates one that includes alice as participant;
      // dave initiates one that does NOT involve alice.
      await service.recordStarted({
        conversationId: 'c1',
        initiatorId: 'alice',
        roomId: 'r1',
        participants: ['bob'],
      });
      await service.recordStarted({
        conversationId: 'c2',
        initiatorId: 'alice',
        roomId: 'r2',
        participants: ['carol'],
      });
      await service.recordStarted({
        conversationId: 'c3',
        initiatorId: 'bob',
        roomId: 'r3',
        participants: ['alice'],
      });
      await service.recordStarted({
        conversationId: 'c4',
        initiatorId: 'dave',
        roomId: 'r4',
        participants: ['erin'],
      });
    }

    it('returns only calls the user initiated or participated in', async () => {
      const service = new CallRecordService(createFakeCallPrisma());
      await seed(service);

      const history = await service.listHistory('alice');

      expect(history.total).toBe(3);
      const rooms = history.calls.map((c) => c.roomId);
      expect(rooms).not.toContain('r4'); // dave's call, alice not involved
      // Every returned call involves alice.
      for (const call of history.calls) {
        const involved = call.initiatorId === 'alice' || call.participants.includes('alice');
        expect(involved).toBe(true);
      }
    });

    it('returns calls newest-first', async () => {
      const service = new CallRecordService(createFakeCallPrisma());
      await seed(service);

      const history = await service.listHistory('alice');
      const times = history.calls.map((c) => c.createdAt.getTime());
      const sortedDesc = [...times].sort((a, b) => b - a);
      expect(times).toEqual(sortedDesc);
      // Newest involving alice is bob's call (c3, created last among alice's).
      expect(history.calls[0]!.roomId).toBe('r3');
    });

    it('paginates while reporting the full total', async () => {
      const service = new CallRecordService(createFakeCallPrisma());
      await seed(service);

      const page1 = await service.listHistory('alice', { page: 1, pageSize: 2 });
      expect(page1.calls).toHaveLength(2);
      expect(page1.total).toBe(3);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(2);

      const page2 = await service.listHistory('alice', { page: 2, pageSize: 2 });
      expect(page2.calls).toHaveLength(1);
      expect(page2.total).toBe(3);

      // No overlap between pages.
      const ids = new Set(page1.calls.map((c) => c.id));
      expect(page2.calls.some((c) => ids.has(c.id))).toBe(false);
    });

    it('returns an empty page for a user with no calls', async () => {
      const service = new CallRecordService(createFakeCallPrisma());
      await seed(service);

      const history = await service.listHistory('nobody');
      expect(history.total).toBe(0);
      expect(history.calls).toEqual([]);
    });

    it('rejects a missing userId', async () => {
      const service = new CallRecordService(createFakeCallPrisma());
      await expect(service.listHistory('  ')).rejects.toThrow('userId is required');
    });
  });
});
