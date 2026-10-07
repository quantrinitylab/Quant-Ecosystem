import { describe, it, expect } from 'vitest';
import { SegmentService, type SegmentRow } from '../services/segment.service';

function prismaWith(rows: SegmentRow[]) {
  return {
    videoSegment: {
      findMany: async () => rows,
      create: async () => rows[0]!,
      deleteMany: async () => ({ count: 0 }),
    },
  };
}

function seg(over: Partial<SegmentRow>): SegmentRow {
  return {
    id: over.id ?? 's1',
    videoId: over.videoId ?? 'v1',
    kind: over.kind ?? 'content',
    label: over.label ?? null,
    startSec: over.startSec ?? 0,
    endSec: over.endSec ?? 60,
    source: over.source ?? 'ai',
  };
}

describe('SegmentService.findTopicJumps ("teach me X")', () => {
  it('rejects an empty / stopword-only query', async () => {
    const svc = new SegmentService(prismaWith([]) as never);
    await expect(svc.findTopicJumps('v1', '   ')).rejects.toMatchObject({ statusCode: 400 });
    await expect(svc.findTopicJumps('v1', 'teach me how to')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('returns segments whose label matches the query, as jump targets', async () => {
    const svc = new SegmentService(
      prismaWith([
        seg({
          id: 'a',
          kind: 'content',
          label: 'Installing dependencies',
          startSec: 10,
          endSec: 40,
        }),
        seg({
          id: 'b',
          kind: 'content',
          label: 'Writing the first test',
          startSec: 40,
          endSec: 80,
        }),
        seg({ id: 'c', kind: 'sponsor', label: 'Our sponsor', startSec: 80, endSec: 95 }),
      ]) as never,
    );
    const jumps = await svc.findTopicJumps('v1', 'teach me about writing a test');
    expect(jumps.length).toBeGreaterThan(0);
    expect(jumps[0]!.segmentId).toBe('b'); // "writing"+"test" match
    expect(jumps[0]!.startSec).toBe(40); // jump target
  });

  it('returns an empty array when nothing matches', async () => {
    const svc = new SegmentService(
      prismaWith([seg({ id: 'a', label: 'Introduction', kind: 'intro' })]) as never,
    );
    const jumps = await svc.findTopicJumps('v1', 'kubernetes networking');
    expect(jumps).toEqual([]);
  });

  it('boosts core content over other kinds on an equal keyword match', async () => {
    const svc = new SegmentService(
      prismaWith([
        seg({ id: 'recap', kind: 'recap', label: 'deployment recap', startSec: 5, endSec: 15 }),
        seg({
          id: 'main',
          kind: 'content',
          label: 'deployment walkthrough',
          startSec: 20,
          endSec: 90,
        }),
      ]) as never,
    );
    const jumps = await svc.findTopicJumps('v1', 'deployment');
    expect(jumps[0]!.segmentId).toBe('main');
  });

  it('respects the limit', async () => {
    const svc = new SegmentService(
      prismaWith([
        seg({ id: 'a', label: 'react hooks intro', startSec: 0, endSec: 10 }),
        seg({ id: 'b', label: 'react hooks state', startSec: 10, endSec: 20 }),
        seg({ id: 'c', label: 'react hooks effects', startSec: 20, endSec: 30 }),
      ]) as never,
    );
    const jumps = await svc.findTopicJumps('v1', 'react hooks', { limit: 2 });
    expect(jumps).toHaveLength(2);
  });
});
