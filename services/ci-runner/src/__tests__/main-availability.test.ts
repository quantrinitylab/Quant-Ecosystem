import { beforeEach, describe, expect, it, vi } from 'vitest';

type Processor = (job: {
  data: { runId: string; repoId: string; configYaml: string };
}) => Promise<unknown>;
const state = vi.hoisted(() => ({
  processor: undefined as Processor | undefined,
  parse: vi.fn(),
  order: vi.fn(),
  start: vi.fn(),
  append: vi.fn(),
  end: vi.fn(),
}));

vi.mock('@quant/queue', () => ({
  createTypedWorker: (_name: string, _schema: unknown, processor: Processor) => {
    state.processor = processor;
    return {};
  },
}));
vi.mock('@quant/health-server', () => ({ startHealthServer: vi.fn(async () => undefined) }));
vi.mock('../parser.js', () => ({
  CIConfigParser: class {
    parseConfig = state.parse;
    getExecutionOrder = state.order;
  },
}));
vi.mock('../log-streamer.js', () => ({
  LogStreamer: class {
    startStreaming = state.start;
    appendLog = state.append;
    endStreaming = state.end;
  },
}));

describe('CI run availability gate', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    state.processor = undefined;
    await import('../main.js');
  });

  it.each([
    ['empty workflow', 'jobs: {}'],
    ['allowed step failure', 'jobs:\n  fixture:\n    script: []\n    allowFailure: true'],
  ])('rejects an unavailable %s before parsing or logging', async (_label, configYaml) => {
    expect(state.processor).toBeTypeOf('function');
    await expect(
      state.processor!({ data: { runId: 'fixture-run', repoId: 'fixture-repo', configYaml } }),
    ).rejects.toMatchObject({ code: 'CI_EXECUTOR_UNAVAILABLE' });
    expect(state.parse).not.toHaveBeenCalled();
    expect(state.order).not.toHaveBeenCalled();
    expect(state.start).not.toHaveBeenCalled();
    expect(state.append).not.toHaveBeenCalled();
  });
});
