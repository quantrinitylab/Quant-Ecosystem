import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyCiRunQueueEvent,
  syncCiJobRowsFromRunnerResult,
  startCiRunStatusSync,
  __resetCiRunStatusSyncForTests,
  type CiRunQueueEventName,
  type CiRunQueueEventArgs,
  type CiRunQueueEventsLike,
} from '../modules/code/services/ci-run-events';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface CiJobUpsertArgs {
  where: { id: string };
  create: { id: string; runId: string; name: string; status: string; logs: string | null };
  update: { name: string; status: string; logs: string | null };
}

function createMockStore() {
  return {
    ciRun: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    ciJob: {
      upsert: vi.fn(async (_args: CiJobUpsertArgs) => ({})),
    },
  };
}

type Store = ReturnType<typeof createMockStore>;

/** Fake QueueEvents: lets tests fire queue events without Redis. */
function createFakeEvents() {
  const listeners = new Map<string, Array<(args: CiRunQueueEventArgs) => void>>();
  function on(event: 'error', listener: (err: Error) => void): unknown;
  function on(event: CiRunQueueEventName, listener: (args: CiRunQueueEventArgs) => void): unknown;
  function on(
    event: string,
    listener: ((args: CiRunQueueEventArgs) => void) | ((err: Error) => void),
  ): unknown {
    const list = listeners.get(event) ?? [];
    list.push(listener as (args: CiRunQueueEventArgs) => void);
    listeners.set(event, list);
    return undefined;
  }
  const fake: CiRunQueueEventsLike = {
    on,
    close: vi.fn(async () => {}),
  };
  const emit = (event: CiRunQueueEventName, jobId?: string, returnvalue?: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener({ jobId, returnvalue });
  };
  return { fake, emit };
}

/** A realistic ci-runner PipelineRunResult return value. */
function runnerResult() {
  return {
    runId: 'run-1',
    status: 'failed',
    duration: 1234,
    jobs: {
      build: {
        name: 'build',
        stage: 'build',
        status: 'success',
        result: { exitCode: 0, stdout: 'npm run build\nok', stderr: '', duration: 10, status: 'success' },
        allowFailure: false,
      },
      test: {
        name: 'test',
        stage: 'test',
        status: 'failed',
        result: { exitCode: 1, stdout: 'running tests', stderr: 'FAIL src/a.test.ts', duration: 20, status: 'failed' },
        allowFailure: false,
      },
      lint: {
        name: 'lint',
        stage: 'test',
        status: 'skipped',
        allowFailure: false,
      },
    },
  };
}

describe('applyCiRunQueueEvent', () => {
  let store: Store;

  beforeEach(() => {
    store = createMockStore();
  });

  it("flips PENDING/RUNNING to RUNNING on 'active'", async () => {
    await applyCiRunQueueEvent(store, 'active', 'run-1');

    expect(store.ciRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'RUNNING', startedAt: expect.any(Date) },
    });
  });

  it("flips PENDING/RUNNING to SUCCESS on 'completed'", async () => {
    await applyCiRunQueueEvent(store, 'completed', 'run-1');

    expect(store.ciRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'SUCCESS', completedAt: expect.any(Date) },
    });
  });

  it("flips PENDING/RUNNING to FAILED on 'failed'", async () => {
    await applyCiRunQueueEvent(store, 'failed', 'run-1');

    expect(store.ciRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'FAILED', completedAt: expect.any(Date) },
    });
  });

  it('does nothing when the event has no jobId', async () => {
    await applyCiRunQueueEvent(store, 'completed', undefined);

    expect(store.ciRun.updateMany).not.toHaveBeenCalled();
  });

  it("syncs CiJob rows from the runner return value on 'completed'", async () => {
    await applyCiRunQueueEvent(store, 'completed', 'run-1', runnerResult());

    // The fixture reports a failed pipeline -> the run flips to FAILED (the
    // runner returns its summary instead of throwing on job failure).
    expect(store.ciRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );

    // One upsert per job, with deterministic ids so redelivered 'completed'
    // events are idempotent.
    expect(store.ciJob.upsert).toHaveBeenCalledTimes(3);
    expect(store.ciJob.upsert).toHaveBeenCalledWith({
      where: { id: 'run-1:build' },
      create: {
        id: 'run-1:build',
        runId: 'run-1',
        name: 'build',
        status: 'SUCCESS',
        logs: 'npm run build\nok',
      },
      update: { name: 'build', status: 'SUCCESS', logs: 'npm run build\nok' },
    });
    expect(store.ciJob.upsert).toHaveBeenCalledWith({
      where: { id: 'run-1:test' },
      create: {
        id: 'run-1:test',
        runId: 'run-1',
        name: 'test',
        status: 'FAILED',
        // stdout then stderr, exactly what the runner captured.
        logs: 'running tests\nFAIL src/a.test.ts',
      },
      update: { name: 'test', status: 'FAILED', logs: 'running tests\nFAIL src/a.test.ts' },
    });
    // 'skipped' maps to CANCELLED; no captured output -> null logs (honest,
    // never fabricated).
    expect(store.ciJob.upsert).toHaveBeenCalledWith({
      where: { id: 'run-1:lint' },
      create: { id: 'run-1:lint', runId: 'run-1', name: 'lint', status: 'CANCELLED', logs: null },
      update: { name: 'lint', status: 'CANCELLED', logs: null },
    });
  });

  it("flips to SUCCESS on 'completed' when the runner reports success", async () => {
    await applyCiRunQueueEvent(store, 'completed', 'run-1', {
      ...runnerResult(),
      status: 'success',
    });

    expect(store.ciRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
    );
    expect(store.ciJob.upsert).toHaveBeenCalledTimes(3);
  });

  it("keeps the legacy SUCCESS mapping on 'completed' with no return value", async () => {
    // Pre-fix workers return nothing; the event-name mapping still applies.
    await applyCiRunQueueEvent(store, 'completed', 'run-1');

    expect(store.ciRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
    );
    expect(store.ciJob.upsert).not.toHaveBeenCalled();
  });

  it("does not write CiJob rows on 'active' or 'failed' events", async () => {
    await applyCiRunQueueEvent(store, 'active', 'run-1', runnerResult());
    await applyCiRunQueueEvent(store, 'failed', 'run-2', runnerResult());

    expect(store.ciJob.upsert).not.toHaveBeenCalled();
  });

  it("does not throw on malformed 'completed' return values", async () => {
    for (const bad of [undefined, null, 'nope', 42, [], { jobs: 'nope' }, { jobs: null }, { jobs: [] }]) {
      await applyCiRunQueueEvent(store, 'completed', 'run-1', bad);
    }
    // The run-status flip is unaffected by the garbage payload.
    expect(store.ciRun.updateMany).toHaveBeenCalledTimes(8);
    expect(store.ciJob.upsert).not.toHaveBeenCalled();
  });

  it('caps persisted logs instead of storing megabytes', async () => {
    const big = 'x'.repeat(300_000);
    await applyCiRunQueueEvent(store, 'completed', 'run-1', {
      jobs: { big: { name: 'big', status: 'success', result: { stdout: big, stderr: '' } } },
    });

    const firstCall = store.ciJob.upsert.mock.calls[0];
    if (!firstCall) throw new Error('expected ciJob.upsert to have been called');
    const logs = firstCall[0].create.logs as string;
    expect(logs.length).toBeLessThanOrEqual(250_000);
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe('syncCiJobRowsFromRunnerResult', () => {
  let store: Store;

  beforeEach(() => {
    store = createMockStore();
  });

  it('skips job entries with unknown statuses instead of writing bad rows', async () => {
    await syncCiJobRowsFromRunnerResult(store, 'run-1', {
      jobs: {
        weird: { name: 'weird', status: 'exploded', result: { stdout: 'boom' } },
        nameless: { status: 'success', result: { stdout: 'hi' } },
        nulljob: null,
      },
    });

    // 'exploded' is not a runner status -> skipped; the record key is used
    // as a name fallback for the nameless entry; the null entry is ignored.
    expect(store.ciJob.upsert).toHaveBeenCalledTimes(1);
    expect(store.ciJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-1:nameless' } }),
    );
  });
});

describe('startCiRunStatusSync', () => {
  let store: Store;

  beforeEach(() => {
    __resetCiRunStatusSyncForTests();
    store = createMockStore();
  });

  it('returns null when there is no store', () => {
    expect(startCiRunStatusSync(null)).toBeNull();
    expect(startCiRunStatusSync(undefined)).toBeNull();
  });

  it('routes queue events to the CiRun row and stops on close', async () => {
    const { fake, emit } = createFakeEvents();
    const stop = startCiRunStatusSync(store, { createEvents: () => fake });

    expect(stop).not.toBeNull();

    emit('active', 'run-1');
    emit('completed', 'run-2');
    emit('failed', 'run-3');
    // Allow the void'd promise handlers to settle.
    await new Promise((resolve) => setImmediate(resolve));

    expect(store.ciRun.updateMany).toHaveBeenCalledTimes(3);
    expect(store.ciRun.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ status: 'RUNNING' }) }),
    );
    expect(store.ciRun.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
    );
    expect(store.ciRun.updateMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );

    await stop!();
    expect(fake.close).toHaveBeenCalled();
  });

  it("passes the 'completed' return value through to the CiJob sync", async () => {
    const { fake, emit } = createFakeEvents();
    const stop = startCiRunStatusSync(store, { createEvents: () => fake });

    emit('completed', 'run-9', runnerResult());
    await new Promise((resolve) => setImmediate(resolve));

    expect(store.ciJob.upsert).toHaveBeenCalledTimes(3);
    expect(store.ciJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-9:build' } }),
    );

    await stop!();
  });

  it('is a once-guard: a second start is a no-op', () => {
    const first = startCiRunStatusSync(store, { createEvents: () => createFakeEvents().fake });

    expect(first).not.toBeNull();
    expect(startCiRunStatusSync(store, { createEvents: () => createFakeEvents().fake })).toBeNull();
  });
});
