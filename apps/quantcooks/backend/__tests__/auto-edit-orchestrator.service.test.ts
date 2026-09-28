import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AutoEditOrchestrator,
  NullRenderer,
  type AutoEditPrisma,
  type AutoEditRunRow,
  type RenderPort,
  type PublishPort,
  type CreditsPort,
} from '../services/auto-edit-orchestrator.service';

function createFakePrisma() {
  const runs = new Map<string, AutoEditRunRow>();
  let n = 0;
  const key = (userId: string, utcDay: string) => `${userId}::${utcDay}`;
  const prisma: AutoEditPrisma & { runs: Map<string, AutoEditRunRow> } = {
    runs,
    autoEditRun: {
      async findUnique({ where }) {
        return runs.get(key(where.userId_utcDay.userId, where.userId_utcDay.utcDay)) ?? null;
      },
      async create({ data }) {
        n += 1;
        const row: AutoEditRunRow = {
          id: String(data['id'] ?? `run-${n}`),
          userId: String(data['userId']),
          utcDay: String(data['utcDay']),
          status: String(data['status'] ?? 'running'),
          currentStep: 0,
          checkpoints: [],
          sourceRef: null,
          outputUrl: null,
          postId: null,
          creditsCharged: 0,
          error: null,
          startedAt: new Date(),
          finishedAt: null,
        };
        runs.set(key(row.userId, row.utcDay), row);
        return row;
      },
      async update({ where, data }) {
        const row = [...runs.values()].find((r) => r.id === where.id)!;
        const updated = { ...row, ...data } as AutoEditRunRow;
        runs.set(key(updated.userId, updated.utcDay), updated);
        return updated;
      },
    },
  };
  return prisma;
}

const goodRenderer: RenderPort = {
  render: async () => ({ ok: true, outputUrl: 'https://cdn/out.mp4' }),
};
const goodPublisher: PublishPort = { publish: async () => ({ ok: true, postId: 'post-1' }) };
const source = { selectSource: async () => 'asset-1' };

describe('AutoEditOrchestrator', () => {
  let prisma: ReturnType<typeof createFakePrisma>;

  beforeEach(() => {
    prisma = createFakePrisma();
  });

  it('rejects a malformed utcDay', async () => {
    const o = new AutoEditOrchestrator(prisma as never);
    await expect(o.runDaily('u1', { utcDay: '2026/07/01', sourceRef: 's' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('fails closed at render with the default NullRenderer (needs-staging)', async () => {
    const o = new AutoEditOrchestrator(prisma as never); // NullRenderer default
    const summary = await o.runDaily('u1', { utcDay: '2026-07-01', sourceRef: 'asset-1' });
    expect(summary.status).toBe('failed');
    expect(summary.error).toBe('RENDER_NOT_CONFIGURED');
    expect(summary.checkpoints.at(-1)).toMatchObject({ step: 'render', status: 'failed' });
    expect(summary.postId).toBeNull();
  });

  it('runs the full pipeline with configured ports and reports a completed run', async () => {
    const credits: CreditsPort & { calls: string[] } = {
      calls: [],
      debit: async (_u, _c, key) => {
        (credits.calls as string[]).push(key);
      },
    };
    const o = new AutoEditOrchestrator(prisma as never, {
      renderer: goodRenderer,
      publisher: goodPublisher,
      sourceSelector: source,
      credits,
      creditsPerRun: 10,
      generateId: () => 'run-1',
    });
    const summary = await o.runDaily('u1', { utcDay: '2026-07-01', caption: 'daily reel' });

    expect(summary.status).toBe('completed');
    expect(summary.outputUrl).toBe('https://cdn/out.mp4');
    expect(summary.postId).toBe('post-1');
    expect(summary.creditsCharged).toBe(10);
    expect(summary.checkpoints.map((c) => c.step)).toEqual([
      'select_source',
      'render',
      'meter',
      'publish',
    ]);
    expect(credits.calls).toEqual(['auto-edit:run-1']);
  });

  it('is idempotent: a completed run for the day is not reprocessed (no double-post)', async () => {
    const publish = vi.fn(async () => ({ ok: true, postId: 'post-1' }));
    const o = new AutoEditOrchestrator(prisma as never, {
      renderer: goodRenderer,
      publisher: { publish },
      sourceSelector: source,
    });
    await o.runDaily('u1', { utcDay: '2026-07-01' });
    expect(publish).toHaveBeenCalledTimes(1);
    const again = await o.runDaily('u1', { utcDay: '2026-07-01' });
    expect(publish).toHaveBeenCalledTimes(1); // not re-posted
    expect(again.status).toBe('completed');
  });

  it('fails at select_source when no source is available', async () => {
    const o = new AutoEditOrchestrator(prisma as never, {
      renderer: goodRenderer,
      publisher: goodPublisher,
      sourceSelector: { selectSource: async () => null },
    });
    const summary = await o.runDaily('u1', { utcDay: '2026-07-01' });
    expect(summary.status).toBe('failed');
    expect(summary.error).toBe('NO_SOURCE_AVAILABLE');
  });

  it('fails at meter (and does not publish) when the credit debit throws', async () => {
    const publish = vi.fn(async () => ({ ok: true, postId: 'post-1' }));
    const o = new AutoEditOrchestrator(prisma as never, {
      renderer: goodRenderer,
      publisher: { publish },
      sourceSelector: source,
      credits: {
        debit: async () => {
          throw new Error('OUT_OF_CREDITS');
        },
      },
    });
    const summary = await o.runDaily('u1', { utcDay: '2026-07-01' });
    expect(summary.status).toBe('failed');
    expect(summary.error).toBe('OUT_OF_CREDITS');
    expect(publish).not.toHaveBeenCalled();
  });

  it('fails at publish when the publisher rejects', async () => {
    const o = new AutoEditOrchestrator(prisma as never, {
      renderer: goodRenderer,
      publisher: { publish: async () => ({ ok: false, error: 'PUBLISH_NOT_CONFIGURED' }) },
      sourceSelector: source,
    });
    const summary = await o.runDaily('u1', { utcDay: '2026-07-01' });
    expect(summary.status).toBe('failed');
    expect(summary.error).toBe('PUBLISH_NOT_CONFIGURED');
    expect(summary.checkpoints.at(-1)).toMatchObject({ step: 'publish', status: 'failed' });
  });

  it('NullRenderer reports a fail-closed render result', async () => {
    const r = await new NullRenderer().render();
    expect(r).toEqual({ ok: false, error: 'RENDER_NOT_CONFIGURED' });
  });
});
