// ============================================================================
// fix/qm-ci-logs-redis-publish — prove the ci-runner wires a real Redis
// publisher into the LogStreamer so builds publish to
// channel:ci:build:<runId>:logs (the channel the backend SSE endpoint
// subscribes to). Uses the REAL LogStreamer with a fake publisher.
// ============================================================================
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Processor = (job: {
  data: { runId: string; repoId: string; configYaml: string };
}) => Promise<unknown>;

const state = vi.hoisted(() => ({
  processor: undefined as Processor | undefined,
  publisherCreated: false,
  published: [] as Array<{ channel: string; message: string }>,
  multiJob: false,
}));

vi.mock('@quant/queue', () => ({
  createTypedWorker: (_name: string, _schema: unknown, processor: Processor) => {
    state.processor = processor;
    return {};
  },
  createLogRedisPublisher: () => {
    state.publisherCreated = true;
    return {
      publish: vi.fn(async (channel: string, message: string) => {
        state.published.push({ channel, message });
        return 1;
      }),
      close: vi.fn(async () => undefined),
    };
  },
}));

vi.mock('@quant/health-server', () => ({ startHealthServer: vi.fn(async () => undefined) }));

vi.mock('../parser.js', () => ({
  CIConfigParser: class {
    parseConfig() {
      if (state.multiJob) {
        return {
          jobs: {
            'job-a': { name: 'job-a', stage: 'test', script: ['echo a'] },
            'job-b': { name: 'job-b', stage: 'test', script: ['echo b'] },
          },
        };
      }
      return {
        jobs: {
          // Dashed job name: also proves the stream publishes to the RUN's
          // channel, not a dash-mangled one.
          'build-test': { name: 'build-test', stage: 'test', script: ['echo hi'] },
        },
      };
    }
    getExecutionOrder() {
      return state.multiJob ? [['job-a'], ['job-b']] : [['build-test']];
    }
  },
}));

vi.mock('../executor.js', () => ({
  CIJobExecutor: class {
    assertAvailable() {}
    async executeJob(job: { name: string }) {
      if (state.multiJob && job.name === 'job-a') {
        return { status: 'failed', stdout: 'boom\n', stderr: '', exitCode: 1 };
      }
      return { status: 'success', stdout: 'line-a\nline-b\n', stderr: '', exitCode: 0 };
    }
  },
}));

describe('ci-runner log publisher wiring (fix/qm-ci-logs-redis-publish)', () => {
  beforeEach(async () => {
    vi.resetModules();
    state.processor = undefined;
    state.publisherCreated = false;
    state.published = [];
    state.multiJob = false;
    await import('../main.js');
  });

  it('creates a Redis log publisher at startup', () => {
    expect(state.publisherCreated).toBe(true);
  });

  it('publishes executed build stdout to channel:ci:build:<runId>:logs', async () => {
    expect(state.processor).toBeTypeOf('function');

    await state.processor!({
      data: { runId: 'run-42', repoId: 'repo-1', configYaml: 'jobs: {}' },
    });

    // endStreaming(terminal) flushes synchronously-invoked publish calls,
    // so no timer advancement is needed.
    expect(state.published).toHaveLength(1);
    const { channel, message } = state.published[0]!;
    expect(channel).toBe('channel:ci:build:run-42:logs');

    const payload = JSON.parse(message);
    expect(payload.buildId).toBe('run-42');
    expect(payload.isEnd).toBe(true);
    expect(payload.entries.map((e: { line: string }) => e.line)).toEqual([
      'line-a',
      'line-b',
      '',
    ]);
  });

  it('returns a failed run result (not a throw) when a non-final job fails', async () => {
    state.multiJob = true;
    vi.resetModules();
    state.published = [];
    await import('../main.js');

    // fix/qm-quantgit-cijob-persist: the worker RETURNs the per-job run
    // summary as the BullMQ job's return value instead of throwing, so the
    // backend can persist CiJob rows + logs from the 'completed' event.
    const result = (await state.processor!({
      data: { runId: 'run-42', repoId: 'repo-1', configYaml: 'jobs: {}' },
    })) as {
      runId: string;
      status: string;
      duration: number;
      jobs: Record<
        string,
        {
          name: string;
          stage: string;
          status: string;
          allowFailure: boolean;
          result?: { status: string; stdout: string; exitCode: number };
        }
      >;
    };

    expect(result.runId).toBe('run-42');
    expect(result.status).toBe('failed');
    expect(result.duration).toBeGreaterThanOrEqual(1);

    // Per-job breakdown: job-a failed hard; job-b never ran and is skipped.
    const jobA = result.jobs['job-a'];
    expect(jobA).toBeDefined();
    expect(jobA).toMatchObject({
      name: 'job-a',
      stage: 'test',
      status: 'failed',
      allowFailure: false,
    });
    expect(jobA!.result).toMatchObject({
      status: 'failed',
      stdout: 'boom\n',
      exitCode: 1,
    });
    expect(result.jobs['job-b']).toMatchObject({
      name: 'job-b',
      stage: 'test',
      status: 'skipped',
      allowFailure: false,
    });

    // job-a's end ran with terminal:false (entries flushed, no isEnd); the
    // failed-pipeline path then published the build-level terminal marker so
    // SSE subscribers don't hang on "live" forever.
    expect(state.published.length).toBeGreaterThanOrEqual(2);
    for (const { channel } of state.published) {
      expect(channel).toBe('channel:ci:build:run-42:logs');
    }
    const payloads = state.published.map((p) => JSON.parse(p.message));
    const terminals = payloads.filter((p) => p.isEnd === true);
    expect(terminals).toHaveLength(1);
    expect(terminals[0].buildId).toBe('run-42');
    expect(terminals[0].entries).toEqual([]);
  });
});
