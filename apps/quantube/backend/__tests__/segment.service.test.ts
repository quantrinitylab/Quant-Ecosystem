import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SegmentService,
  mergeRanges,
  invertRanges,
  type SegmentRow,
} from '../services/segment.service';

function createMockPrisma() {
  const rows: SegmentRow[] = [];
  let n = 0;
  return {
    _rows: rows,
    videoSegment: {
      findMany: vi.fn(async ({ where }: any) =>
        rows.filter((r) => !where?.videoId || r.videoId === where.videoId).map((r) => ({ ...r })),
      ),
      create: vi.fn(async ({ data }: any) => {
        const row: SegmentRow = {
          id: `seg-${++n}`,
          videoId: data.videoId,
          kind: data.kind,
          label: data.label ?? null,
          startSec: data.startSec,
          endSec: data.endSec,
          source: data.source ?? 'ai',
        };
        rows.push(row);
        return { ...row };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (!where?.videoId || rows[i]!.videoId === where.videoId) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      }),
    },
  };
}

describe('pure interval helpers', () => {
  it('mergeRanges merges overlapping and adjacent ranges', () => {
    const merged = mergeRanges([
      { startSec: 10, endSec: 20 },
      { startSec: 15, endSec: 25 },
      { startSec: 25, endSec: 30 },
      { startSec: 40, endSec: 45 },
    ]);
    expect(merged).toEqual([
      { startSec: 10, endSec: 30 },
      { startSec: 40, endSec: 45 },
    ]);
  });

  it('invertRanges returns the complement within [0, duration]', () => {
    const play = invertRanges(
      [
        { startSec: 0, endSec: 10 },
        { startSec: 50, endSec: 60 },
      ],
      100,
    );
    expect(play).toEqual([
      { startSec: 10, endSec: 50 },
      { startSec: 60, endSec: 100 },
    ]);
  });

  it('invertRanges yields the whole video when nothing is skipped', () => {
    expect(invertRanges([], 100)).toEqual([{ startSec: 0, endSec: 100 }]);
  });
});

describe('SegmentService', () => {
  let service: SegmentService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new SegmentService(prisma as never);
  });

  it('stores and lists segments sorted by start time', async () => {
    await service.setSegments('v1', [
      { kind: 'content', startSec: 10, endSec: 100 },
      { kind: 'intro', startSec: 0, endSec: 10 },
    ]);
    const list = await service.listSegments('v1');
    expect(list.map((s) => s.kind)).toEqual(['intro', 'content']);
  });

  it('rejects an invalid kind or range', async () => {
    await expect(
      service.setSegments('v1', [{ kind: 'bogus' as never, startSec: 0, endSec: 5 }]),
    ).rejects.toMatchObject({ code: 'INVALID_SEGMENT_KIND' });
    await expect(
      service.setSegments('v1', [{ kind: 'intro', startSec: 5, endSec: 5 }]),
    ).rejects.toMatchObject({ code: 'INVALID_SEGMENT_RANGE' });
  });

  it('computes a skip-plan removing intro/sponsor/outro by default', async () => {
    await service.setSegments('v1', [
      { kind: 'intro', startSec: 0, endSec: 10 },
      { kind: 'content', startSec: 10, endSec: 50 },
      { kind: 'sponsor', startSec: 50, endSec: 60 },
      { kind: 'content', startSec: 60, endSec: 110 },
      { kind: 'outro', startSec: 110, endSec: 120 },
    ]);

    const plan = await service.getSkipPlan('v1', { durationSec: 120 });

    expect(plan.skipRanges).toEqual([
      { startSec: 0, endSec: 10 },
      { startSec: 50, endSec: 60 },
      { startSec: 110, endSec: 120 },
    ]);
    expect(plan.playRanges).toEqual([
      { startSec: 10, endSec: 50 },
      { startSec: 60, endSec: 110 },
    ]);
    expect(plan.skippedSec).toBe(30);
    expect(plan.playableSec).toBe(90);
  });

  it('honours a custom skipKinds set', async () => {
    await service.setSegments('v1', [
      { kind: 'intro', startSec: 0, endSec: 10 },
      { kind: 'sponsor', startSec: 50, endSec: 60 },
    ]);
    // Only skip sponsors; keep the intro.
    const plan = await service.getSkipPlan('v1', { durationSec: 120, skipKinds: ['sponsor'] });
    expect(plan.skipRanges).toEqual([{ startSec: 50, endSec: 60 }]);
    expect(plan.playableSec).toBe(110);
  });

  it('clamps segments to the video duration', async () => {
    await service.setSegments('v1', [{ kind: 'outro', startSec: 100, endSec: 999 }]);
    const plan = await service.getSkipPlan('v1', { durationSec: 120 });
    expect(plan.skipRanges).toEqual([{ startSec: 100, endSec: 120 }]);
    expect(plan.playRanges).toEqual([{ startSec: 0, endSec: 100 }]);
  });

  it('rejects an invalid duration', async () => {
    await expect(service.getSkipPlan('v1', { durationSec: 0 })).rejects.toMatchObject({
      code: 'INVALID_DURATION',
    });
  });
});
