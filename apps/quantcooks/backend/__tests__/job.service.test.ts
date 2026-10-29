// ============================================================================
// CP-1 — JobService over the unified EditJob (§13.2): lifecycle, atomic
// claim, idempotency replay, cancel rules, stale sweep, pipeline roll-up,
// settle-at-0 honesty, and the outputs rule — asset refs persisted, URLs
// minted per read and never stored.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { JobService } from '../tools/jobs';
import { createFakeEditJobPrisma, type FakeEditJobPrisma } from './fake-edit-job-prisma';
import { createFakeStorage, FAKE_STORAGE_HOST } from './fake-storage';
import { expectCode, USER, OTHER } from './tools-test-rig';

describe('JobService (CP-1 unified EditJob)', () => {
  let fake: FakeEditJobPrisma;
  let jobs: JobService;

  beforeEach(() => {
    fake = createFakeEditJobPrisma();
    jobs = new JobService(fake as never, createFakeStorage().port);
  });

  it('lifecycle: create → claim → heartbeat → complete', async () => {
    const job = await jobs.createJob({
      userId: USER,
      kind: 'IMAGE_GEN',
      toolName: 'quantcooks.generate_dish_image',
      projectId: 'proj-1',
      params: { prompt: 'biryani' },
    });
    expect(job.status).toBe('QUEUED');
    expect(job.progress).toBe(0);
    expect(job.creditCost).toBe(0);
    expect(job.metering).toBe('not_wired');

    const claimed = await jobs.claimJob(job.id);
    expect(claimed?.status).toBe('PROCESSING');
    expect(claimed?.attempts).toBe(1);

    // A second claim loses the race — the atomic { id, status } update
    // matched nothing.
    expect(await jobs.claimJob(job.id)).toBeNull();

    await jobs.heartbeat(job.id, { progress: 55, stage: 'rendering' });
    const mid = await jobs.getJob(job.id, USER);
    expect(mid.progress).toBe(55);
    expect(mid.stage).toBe('rendering');

    const done = await jobs.completeJob(job.id, { result: { ok: true } });
    expect(done?.status).toBe('COMPLETED');
    expect(done?.progress).toBe(100);
    expect(done?.completedAt).not.toBeNull();
  });

  it('claimNext takes the oldest QUEUED job, kind filter honoured', async () => {
    const a = await jobs.createJob({ userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project' });
    const b = await jobs.createJob({ userId: USER, kind: 'ANALYSIS', toolName: 'quantcooks.score_hook' });
    const claimed = await jobs.claimNext('ANALYSIS');
    expect(claimed?.id).toBe(b.id);
    const next = await jobs.claimNext();
    expect(next?.id).toBe(a.id);
    expect(await jobs.claimNext()).toBeNull();
  });

  it('idempotency: same (user, key) replays the same job, one row', async () => {
    const first = await jobs.createJob({
      userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project', idempotencyKey: 'k-1',
    });
    const replay = await jobs.createJob({
      userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project', idempotencyKey: 'k-1',
    });
    expect(replay.id).toBe(first.id);
    expect(fake.rows).toHaveLength(1);
    // A different user with the same key gets their own job.
    const other = await jobs.createJob({
      userId: OTHER, kind: 'EXPORT', toolName: 'quantcooks.export_project', idempotencyKey: 'k-1',
    });
    expect(other.id).not.toBe(first.id);
  });

  it('owner scoping: another user’s job reads as 404 JOB_NOT_FOUND', async () => {
    const job = await jobs.createJob({ userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project' });
    await expectCode(jobs.getJob(job.id, OTHER), 'JOB_NOT_FOUND', 404);
    await expectCode(jobs.cancelJob(job.id, OTHER), 'JOB_NOT_FOUND', 404);
    await expectCode(jobs.getJob('missing', USER), 'JOB_NOT_FOUND', 404);
  });

  it('cancel: QUEUED → FAILED/USER_CANCELLED; PROCESSING → CANNOT_CANCEL_JOB', async () => {
    const job = await jobs.createJob({ userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project' });
    const cancelled = await jobs.cancelJob(job.id, USER);
    expect(cancelled.status).toBe('FAILED');
    expect(cancelled.error).toBe('USER_CANCELLED');

    const job2 = await jobs.createJob({ userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project' });
    await jobs.claimJob(job2.id);
    await expectCode(jobs.cancelJob(job2.id, USER), 'CANNOT_CANCEL_JOB', 400);
  });

  it('stale sweep: old PROCESSING → FAILED/PROCESSOR_INTERRUPTED, never re-queued', async () => {
    const job = await jobs.createJob({ userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project' });
    await jobs.claimJob(job.id);
    // Age the row beyond the sweep horizon.
    fake.rows[0]!.updatedAt = new Date(Date.now() - 60 * 60 * 1000);
    const swept = await jobs.failStaleProcessing(new Date());
    expect(swept).toBe(1);
    const after = await jobs.getJob(job.id, USER);
    expect(after.status).toBe('FAILED');
    expect(after.error).toBe('PROCESSOR_INTERRUPTED');
    expect(await jobs.claimNext()).toBeNull();
  });

  it('outputs: refs persisted, signed URL minted per read, never stored', async () => {
    fake.assets.set('asset-out', {
      id: 'asset-out',
      url: 'quantcooks/user-1/proj-1/asset-out/film.mp4',
      metadata: { uploadStatus: 'READY' },
    });
    const job = await jobs.createJob({ userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project' });
    await jobs.claimJob(job.id);
    const done = await jobs.completeJob(job.id, {
      outputs: [{ assetId: 'asset-out', kind: 'video' }],
    });
    expect(done?.outputs[0]?.url).toContain(FAKE_STORAGE_HOST);
    expect(done?.outputs[0]?.url).toContain('film.mp4');
    // The stored row holds the ref only — no URL is ever persisted (§5.2).
    const stored = fake.rows[0]!;
    expect(JSON.stringify(stored.outputs)).not.toContain('http');
    expect(stored.outputs).toEqual([{ assetId: 'asset-out', kind: 'video' }]);
    // A PENDING output asset mints no URL (never fabricated).
    fake.assets.set('asset-pending', {
      id: 'asset-pending',
      url: 'quantcooks/user-1/proj-1/asset-pending/x.mp4',
      metadata: { uploadStatus: 'PENDING' },
    });
    const job2 = await jobs.createJob({ userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project' });
    await jobs.claimJob(job2.id);
    const done2 = await jobs.completeJob(job2.id, {
      outputs: [{ assetId: 'asset-pending', kind: 'video' }],
    });
    expect(done2?.outputs[0]?.url).toBeNull();
  });

  it('pipeline roll-up: true ratio, completes on all-settled, fails naming the step', async () => {
    const parent = await jobs.createJob({ userId: USER, kind: 'PIPELINE', toolName: 'quantcooks.run_pipeline' });
    const c1 = await jobs.createJob({
      userId: USER, kind: 'IMAGE_GEN', toolName: 'quantcooks.generate_dish_image', parentJobId: parent.id, creditCost: 3,
    });
    const c2 = await jobs.createJob({
      userId: USER, kind: 'VIDEO_GEN', toolName: 'quantcooks.animate_image', parentJobId: parent.id, creditCost: 4,
    });
    await jobs.claimJob(c1.id);
    await jobs.completeJob(c1.id, { creditCost: 3 });
    let p = await jobs.getJob(parent.id, USER);
    expect(p.status).toBe('QUEUED');
    expect(p.progress).toBe(50);
    expect(p.creditCost).toBe(7);

    await jobs.claimJob(c2.id);
    await jobs.failJob(c2.id, 'PROVIDER_NOT_CONFIGURED');
    p = await jobs.getJob(parent.id, USER);
    expect(p.status).toBe('FAILED');
    expect(p.error).toContain('quantcooks.animate_image');
  });

  it('failure honesty: FAILED jobs report refunded 0 while no reservation port exists (CP-1)', async () => {
    const job = await jobs.createJob({ userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project' });
    await jobs.claimJob(job.id);
    const failed = await jobs.failJob(job.id, 'EXPORT_FORMAT_NOT_SUPPORTED');
    expect(failed.status).toBe('FAILED');
    expect(failed.refunded).toBe(0);
    expect(failed.error).toBe('EXPORT_FORMAT_NOT_SUPPORTED');
  });

  it('completeJob from QUEUED is a no-op (null) — only PROCESSING completes', async () => {
    const job = await jobs.createJob({ userId: USER, kind: 'EXPORT', toolName: 'quantcooks.export_project' });
    expect(await jobs.completeJob(job.id, {})).toBeNull();
    expect((await jobs.getJob(job.id, USER)).status).toBe('QUEUED');
  });
});
