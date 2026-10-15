import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyCiRunQueueEvent,
  startCiRunStatusSync,
  __resetCiRunStatusSyncForTests,
  type CiRunQueueEventName,
  type CiRunQueueEventsLike,
} from '../modules/code/services/ci-run-events';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function createMockStore() {
  return {
    ciRun: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

type Store = ReturnType<typeof createMockStore>;

/** Fake QueueEvents: lets tests fire queue events without Redis. */
function createFakeEvents() {
  const listeners = new Map<string, Array<(args: { jobId?: string }) => void>>();
  function on(event: 'error', listener: (err: Error) => void): unknown;
  function on(event: CiRunQueueEventName, listener: (args: { jobId?: string }) => void): unknown;
  function on(
    event: string,
    listener: ((args: { jobId?: string }) => void) | ((err: Error) => void),
  ): unknown {
    const list = listeners.get(event) ?? [];
    list.push(listener as (args: { jobId?: string }) => void);
    listeners.set(event, list);
    return undefined;
  }
  const fake: CiRunQueueEventsLike = {
    on,
    close: vi.fn(async () => {}),
  };
  const emit = (event: CiRunQueueEventName, jobId?: string) => {
    for (const listener of listeners.get(event) ?? []) listener({ jobId });
  };
  return { fake, emit };
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

  it('is a once-guard: a second start is a no-op', () => {
    const first = startCiRunStatusSync(store, { createEvents: () => createFakeEvents().fake });

    expect(first).not.toBeNull();
    expect(startCiRunStatusSync(store, { createEvents: () => createFakeEvents().fake })).toBeNull();
  });
});
