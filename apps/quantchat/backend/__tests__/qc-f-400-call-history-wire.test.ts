// ============================================================================
// QC-F-400 — Call-history wire vocabulary (regression)
//
// Defect: the backend call-history DTO (`CallRecordService.toEntry`) passed
// the Prisma UPPERCASE enums (AUDIO/VIDEO, RINGING/…/DECLINED) straight onto
// the wire, while the web /calls page compares against the client's
// lowercase vocabulary ('voice'/'video', 'missed'/…). Every enum-driven
// behaviour on that page silently never matched: the Missed tab was always
// empty, missed styling/icons never fired, every video call rendered as a
// voice call, and status text fell back to the raw shouting enum.
//
// Fix (band, specialist-qc-f-400-buildprep.md §3): the translation lives at
// the backend DTO boundary — exhaustive DB→client maps in toEntry; the
// persisted CallRow stays in DB form (QC-F-287 rehydrate depends on it).
//
// These tests seed rows DIRECTLY in DB form (not via recordStarted, which
// can only produce ACTIVE/VIDEO) and read them back through listHistory.
//
// Negative-control signature (brief §5): on the ORIGINAL service, B1–B5
// FAIL (raw UPPERCASE comes back) and B6/B7 controls PASS.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  CallRecordService,
  type CallRecordPrisma,
  type CallRow,
  type CallStatus,
  type CallType,
} from '../services/call-record.service';

// ---------------------------------------------------------------------------
// In-memory fake of the Prisma `call` delegate — same faithful pattern as
// call-record.service.test.ts (stable, module-level; no per-test identity
// churn).
// ---------------------------------------------------------------------------
function createFakeCallPrisma(): CallRecordPrisma & { __rows: CallRow[] } {
  const rows: CallRow[] = [];
  let idSeq = 0;
  let clock = 1_700_000_000_000;
  const tick = (): Date => new Date((clock += 1000));

  const matches = (row: CallRow, where: Record<string, unknown>): boolean => {
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

/** Seed one row directly in DB (Prisma) form — bypasses recordStarted. */
function seedDbRow(
  prisma: CallRecordPrisma & { __rows: CallRow[] },
  overrides: Partial<CallRow> & { type: CallType; status: CallStatus },
): CallRow {
  const stamp = new Date(1_700_000_500_000 + prisma.__rows.length * 1000);
  const row: CallRow = {
    id: `seed_${prisma.__rows.length + 1}`,
    conversationId: 'conv-seed',
    initiatorId: 'alice',
    startedAt: stamp,
    endedAt: null,
    duration: 42,
    participants: ['alice', 'bob'],
    roomId: `room-seed-${prisma.__rows.length + 1}`,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
  prisma.__rows.push(row);
  return row;
}

describe('QC-F-400 — listHistory translates DB enums to the client wire vocabulary', () => {
  it('B1: AUDIO + ENDED row comes back as voice/ended', async () => {
    const prisma = createFakeCallPrisma();
    const service = new CallRecordService(prisma);
    seedDbRow(prisma, { type: 'AUDIO', status: 'ENDED' });

    const history = await service.listHistory('alice');

    expect(history.calls).toHaveLength(1);
    expect(history.calls[0]!.type).toBe('voice');
    expect(history.calls[0]!.status).toBe('ended');
  });

  it('B2: VIDEO + MISSED row comes back as video/missed', async () => {
    const prisma = createFakeCallPrisma();
    const service = new CallRecordService(prisma);
    seedDbRow(prisma, { type: 'VIDEO', status: 'MISSED' });

    const history = await service.listHistory('alice');

    expect(history.calls[0]!.type).toBe('video');
    expect(history.calls[0]!.status).toBe('missed');
  });

  it('B3: VIDEO + DECLINED row comes back as video/declined', async () => {
    const prisma = createFakeCallPrisma();
    const service = new CallRecordService(prisma);
    seedDbRow(prisma, { type: 'VIDEO', status: 'DECLINED' });

    const history = await service.listHistory('alice');

    expect(history.calls[0]!.type).toBe('video');
    expect(history.calls[0]!.status).toBe('declined');
  });

  it('B4: AUDIO + RINGING row comes back as voice/ringing', async () => {
    const prisma = createFakeCallPrisma();
    const service = new CallRecordService(prisma);
    seedDbRow(prisma, { type: 'AUDIO', status: 'RINGING' });

    const history = await service.listHistory('alice');

    expect(history.calls[0]!.type).toBe('voice');
    expect(history.calls[0]!.status).toBe('ringing');
  });

  it('B5: VIDEO + ACTIVE row comes back as video/active', async () => {
    const prisma = createFakeCallPrisma();
    const service = new CallRecordService(prisma);
    seedDbRow(prisma, { type: 'VIDEO', status: 'ACTIVE' });

    const history = await service.listHistory('alice');

    expect(history.calls[0]!.type).toBe('video');
    expect(history.calls[0]!.status).toBe('active');
  });

  it('B6 (control): non-enum entry fields pass through unchanged', async () => {
    const prisma = createFakeCallPrisma();
    const service = new CallRecordService(prisma);
    const seeded = seedDbRow(prisma, { type: 'AUDIO', status: 'ENDED' });

    const history = await service.listHistory('alice');
    const entry = history.calls[0]!;

    expect(entry.id).toBe(seeded.id);
    expect(entry.conversationId).toBe(seeded.conversationId);
    expect(entry.initiatorId).toBe(seeded.initiatorId);
    expect(entry.participants).toEqual(['alice', 'bob']);
    expect(entry.duration).toBe(42);
    expect(entry.roomId).toBe(seeded.roomId);
    expect(entry.createdAt).toEqual(seeded.createdAt);
    expect(entry.startedAt).toEqual(seeded.startedAt);
    expect(entry.endedAt).toEqual(seeded.endedAt);
  });

  it('B7 (control): the persisted CallRow stays in DB form — normalization is wire-only', async () => {
    const service = new CallRecordService(createFakeCallPrisma());

    const started = await service.recordStarted({
      conversationId: 'conv-1',
      initiatorId: 'alice',
      roomId: 'room-1',
      participants: ['bob'],
    });
    expect(started.type).toBe('VIDEO'); // DB default, not 'video'
    expect(started.status).toBe('ACTIVE'); // DB form, not 'active'

    const ended = await service.recordEnded(started.id, {
      endedAt: new Date(started.startedAt!.getTime() + 30_000),
    });
    expect(ended.status).toBe('ENDED'); // DB form, not 'ended'
  });
});
