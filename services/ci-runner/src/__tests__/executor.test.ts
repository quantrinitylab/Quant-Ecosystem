import { beforeEach, describe, it, expect } from 'vitest';
import { CIJobExecutor, CIExecutorUnavailableError } from '../executor.js';
import type { CIJobConfig } from '../parser.js';

const fixtureJob = (overrides: Partial<CIJobConfig> = {}): CIJobConfig => ({
  name: 'fixture-job',
  image: 'node:22',
  stage: 'test',
  script: ['echo fixture'],
  timeout: '30m',
  allowFailure: false,
  ...overrides,
});

describe('CIJobExecutor availability contract', () => {
  let executor: CIJobExecutor;

  beforeEach(() => {
    executor = new CIJobExecutor();
  });

  it('leaves an untouched job pending', () => {
    expect(executor.getStatus('fixture-job')).toBe('pending');
  });

  it('reports unavailable execution infrastructure explicitly', () => {
    expect(() => executor.assertAvailable()).toThrow(CIExecutorUnavailableError);
    expect(new CIExecutorUnavailableError().code).toBe('CI_EXECUTOR_UNAVAILABLE');
  });

  it('rejects a job instead of manufacturing a successful result', async () => {
    await expect(executor.executeJob(fixtureJob(), {})).rejects.toThrow(CIExecutorUnavailableError);
    expect(executor.getStatus('fixture-job')).toBe('failed');
  });

  it('does not treat an empty script as an executed success', async () => {
    await expect(executor.executeJob(fixtureJob({ script: [] }), {})).rejects.toThrow(
      CIExecutorUnavailableError,
    );
  });

  it('does not suppress unavailability for an allowed step failure', async () => {
    await expect(executor.executeJob(fixtureJob({ allowFailure: true }), {})).rejects.toThrow(
      CIExecutorUnavailableError,
    );
  });

  it('does not expand or read workflow variables before rejecting', async () => {
    const variables: Record<string, string> = {};
    Object.defineProperty(variables, 'FIXTURE_VALUE', {
      enumerable: true,
      get() {
        throw new Error('Variables must not be inspected by an unavailable executor');
      },
    });
    await expect(
      executor.executeJob(fixtureJob({ script: ['echo $FIXTURE_VALUE'] }), variables),
    ).rejects.toThrow(CIExecutorUnavailableError);
  });
});
